/* =====================================================================
   SubSDJ · self-test (?selftest=1)
   Regression net with no external tools: renders every factory preset
   in an OfflineAudioContext (C3 at t=0, +G3 at t=0.5, releases both
   at t=1.0, tail = the preset's release) and checks:
     1) that every key of the preset exists in CONTROLS (catches typos),
     2) that the render contains no NaN/Infinity,
     3) that it is not silence (peak > -40 dBFS),
     4) that there is no clipping (peak <= 0 dBFS).
   Also: a static check of the v1->v2 preset migration and a stress test of
   16 simultaneous notes that exercises MAX_POLY (voice stealing) and MAX_TAILS.
   It walks the SAME path as loading a real preset:
   loadState() over the controls -> engine.S (engine space) -> clone
   -> new engine on the offline context. So it also validates the
   control->engine mapping (logCut, ranges), not only the DSP.
   Results: on-screen panel + console.table + the tab title.
   ===================================================================== */
import { AudioEngine, engine, loadWorklets, VOICE_BUDGET } from './engine/AudioEngine.js';
import { Voice } from './engine/Voice.js';
import { Room, ROOM_KEYS, plateDecay, reverbEnergyGain, HEADROOM_DB, LIM_LOOKAHEAD, LIM_CEIL_DB, LIM_MAKEUP_DB } from './engine/Room.js';
const HR = Math.pow(10, HEADROOM_DB / 20);   // fixed master headroom (1.1.0): the ABSOLUTE level thresholds include it
import { Arp } from './engine/Arp.js';
import { Clock, clockOf } from './engine/Clock.js';
import { Steps, cycleBars } from './engine/Steps.js';
import { Seq, parsePattern, stepFreq, stepToken } from './engine/Seq.js';
import { parseWsPattern } from './engine/WaveSeq.js';
import { SEQ_PATTERNS } from './ui/seqControls.js';
import { FACTORY, BANK, META, BANK_REV, rootOf, migrateV1 } from './engine/presets.js';
import { validateBank, coverage } from './engine/bankCheck.js';
import { LEGACY_FP } from './engine/legacy.js';
import { spectrumOf, pointsFromSpectrum, saveUserFrames, defaultUserFrames, WT_LS, invalidateUserSet, getWtSet,
         encodeUserFrames, decodeUserFrames } from './engine/wavetable.js';
import { PARAMS, PRESET_BASE, valToPos, posToVal } from './engine/params.js';
import { makeDefaultState, applyPreset, toControls, migrateMix, withPresetBase } from './engine/state.js';
import { createScene, sceneToJSON, applySceneJSON, NoteRouter, part } from './engine/parts.js';
import { velFromY, getTouch, setTouch } from './ui/keyboard.js';
import { feedMeter, meterLedOn } from './ui/meter.js';
import { lfoBuffers, makeIR, mkLFO, setLfoShape, seedRender, ctxRandom } from './engine/nodes.js';
import { Arrangement } from './engine/Arrangement.js';
import { Harmony, SCALES } from './engine/Harmony.js';
import { euclid, Player, PLAYER_DEF } from './engine/Player.js';
import { Conductor } from './engine/Conductor.js';
import { CONTROLS, loadState, snapshot } from './ui/registry.js';
import { encodeWav } from './ui/recorder.js';
import { makeSfzKit, makeZip, velocityLayers } from './ui/sfzExport.js';
import { ccToVal, zoneOf, applyCC, armLearn, learnCapture, setDevice, getDevice, getMap } from './ui/midimap.js';
import { loadPresetIndex, loadPresetId, navIds, presetBankReady, currentPresetId } from './ui/presetBank.js';
import { undo, redo, historyDepth, isModified, enterCompare, exitCompare, isComparing } from './ui/history.js';
import { handleMidi } from './ui/midi.js';
import { resRatios, resQ, resGains } from './engine/reson.js';
import { library, Library, SEC_MINE, SEC_SCENES, SEC_IMPORT, REPO_SCENES, canon, fnv } from './engine/library.js';
import { SCREENS, showScreen, currentScreen } from './ui/screens.js';
import { RULES, depTargets, refreshDeps } from './ui/deps.js';
import { listThemes, setTheme, currentTheme, token } from './ui/theme.js';
import { VERSION, RELEASE } from './version.js';
import { splashDate, SplashFx } from './ui/splash.js';
import { FM4_ALGS, layout as fm4Layout, svgFor as fm4Svg } from './ui/fm4Graph.js';

const SR = 44100;
const NOTE1 = 130.81, NOTE2 = 196.0;   // C3 + G3: a chord in poly, legato in mono
const SILENCE = 0.01;                  // -40 dBFS

const dB = v => v > 1e-6 ? (20 * Math.log10(v)).toFixed(1) + ' dB' : '−∞';

function analyze(buf) {
  let peak = 0, bad = 0;
  for (let ch = 0; ch < buf.numberOfChannels; ch++) {
    const d = buf.getChannelData(ch);
    for (let i = 0; i < d.length; i++) {
      const v = d[i];
      if (!Number.isFinite(v)) { bad++; continue; }
      const a = v < 0 ? -v : v;
      if (a > peak) peak = a;
    }
  }
  return { peak, bad };
}

async function renderBuf(state, vel = 1) {
  const dur = Math.min(6, 1.0 + (state.r || 0.3) + 0.3);   // 1 s of note + release tail
  const ctx = new OfflineAudioContext(2, Math.ceil(SR * dur), SR);
  const eng = new AudioEngine();
  eng.S = state;
  await eng.init(ctx);
  eng.noteOn('t1', NOTE1, vel);
  ctx.suspend(0.5).then(() => { eng.noteOn('t2', NOTE2, vel); ctx.resume(); });
  ctx.suspend(1.0).then(() => { eng.noteOff('t1'); eng.noteOff('t2'); ctx.resume(); });
  return ctx.startRendering();
}
async function renderState(state) { return analyze(await renderBuf(state)); }
// Render of ONE note (C3, velocity `vel`) lasting `secs` seconds with noteOff
// at `offAt`: for checks that measure time windows without the 2nd note
// of the standard render polluting them (tape delay, FM in the matrix).
async function renderOne(state, { secs = 2.2, offAt = 0.3, vel = 1 } = {}) {
  const ctx = new OfflineAudioContext(2, Math.ceil(SR * secs), SR);
  const eng = new AudioEngine(); eng.S = state;
  await eng.init(ctx);
  eng.noteOn('t1', NOTE1, vel);
  ctx.suspend(offAt).then(() => { eng.noteOff('t1'); ctx.resume(); });
  return ctx.startRendering();
}
// Spectral tilt of a window [t0,t1): energy of the 1st difference / energy
// (∝ centroid; level-independent). It rises with brightness.
function tiltW(buf, t0, t1) {
  const d = buf.getChannelData(0), i0 = Math.floor(t0 * SR), i1 = Math.min(d.length, Math.floor(t1 * SR));
  let hf = 0, en = 0;
  for (let i = i0 + 1; i < i1; i++) { const e = d[i] - d[i - 1]; hf += e * e; en += d[i] * d[i]; }
  return hf / Math.max(1e-12, en);
}

// Telemetry for headless runs: every GET ends up in the http.server log
// (even if it answers 404), so an external runner can read the results.
const ping = q => { try { fetch('selftest.ping?' + q, { cache: 'no-store' }).catch(() => {}); } catch (e) {} };

async function renderStress(state) {
  const ctx = new OfflineAudioContext(2, Math.ceil(SR * 2), SR);
  const eng = new AudioEngine();
  eng.S = state;
  await eng.init(ctx);
  for (let i = 0; i < 16; i++) eng.noteOn('s' + i, 110 * Math.pow(2, i / 12));
  ctx.suspend(0.5).then(() => { for (let i = 0; i < 16; i++) eng.noteOff('s' + i); ctx.resume(); });
  return analyze(await ctx.startRendering());
}

// FROZEN presets for the checks that need a known sound (parts, scenes, headroom, plate,
// SFZ layers…): copies of the 1.4 bank, so the factory bank is free to change (docs/BANK.md).
const FX = {
  warmPad: { waveA: 'sawtooth', waveB: 'sawtooth', detuneA: -10, detuneB: 14, octavesB: 2, levelA: 0.5, levelB: 0.5, cutoff: 1180, reso: 2, cutLfoLvl: 800, cutLfoSpd: 0.2,
    a: 0.8, d: 0.5, s: 0.8, r: 2.0, dlyAmt: 0.3, dlyTime: 0.5, width: 0.6, reverbMix: 0.32, reverbSize: 2.6, master: 0.95 },
  platePad: { waveA: 'sawtooth', waveB: 'sawtooth', detuneA: -8, detuneB: 10, octavesB: 2, levelA: 0.5, levelB: 0.5, cutoff: 1400, reso: 1.5, a: 0.6, d: 0.5, s: 0.85, r: 1.8, width: 0.5,
    reverbType: 'plate', reverbMix: 0.4, reverbSize: 3.2, reverbDamp: 0.35, reverbPre: 0.02, master: 1.03 },
  glassPad: { waveA: 'sine', waveB: 'sine', ring: 0.3, detuneB: 12, octavesB: 2, levelA: 0.35, levelB: 0.35, cutoff: 5020, a: 0.5, d: 0.6, s: 0.7, r: 1.5, width: 0.5, reverbMix: 0.4, reverbSize: 3.2, master: 1.41 },
  cathedralPad: { waveA: 'sawtooth', waveB: 'triangle', detuneA: -6, detuneB: 8, octavesB: 2, levelA: 0.55, levelB: 0.45, cutoff: 1600, reso: 1, filterSlope: '24', chMode: 'ensemble', chAmt: 0.5, chSpd: 0.5, drift: 3,
    a: 0.7, d: 0.6, s: 0.85, r: 2.2, width: 0.6, reverbMix: 0.42, reverbSize: 3.6, reverbDamp: 0.6, reverbPre: 0.04, master: 1.11 },
  supersawPad: { waveA: 'supersaw', waveB: 'supersaw', spread: 0.7, detuneB: 6, levelA: 0.5, levelB: 0.5, cutoff: 1260, reso: 1.5, a: 0.6, d: 0.5, s: 0.85, r: 1.8, width: 0.7, reverbMix: 0.35, reverbSize: 3, master: 0.96 },
  solinaStrings: { waveA: 'sawtooth', waveB: 'sawtooth', detuneA: -4, detuneB: 5, octavesB: 2, levelA: 0.65, levelB: 0.35, cutoff: 3600, reso: 0.7, morph: 0.12, chMode: 'ensemble', chAmt: 0.85, chSpd: 0.65, drift: 4,
    freqLfoLvl: 7, freqLfoSpd: 5.2, lfoFade: 0.7, a: 0.22, d: 0.3, s: 0.9, r: 0.9, width: 0.35, reverbMix: 0.22, reverbSize: 2.2, master: 0.9 },
  humanChoir: { waveA: 'sawtooth', waveB: 'sawtooth', detuneA: -6, detuneB: 8, levelA: 0.5, levelB: 0.5, vocAmt: 0.75, vocVowel: 0.5, vocQ: 0.65, vocLife: 0.6, noise: 0.08, noiseColor: 0.5, drift: 3, cutoff: 4500, reso: 0.8,
    chMode: 'ensemble', chAmt: 0.55, chSpd: 0.5, freqLfoLvl: 8, freqLfoSpd: 5.2, lfoFade: 0.8, a: 0.5, d: 0.5, s: 0.85, r: 1.6, width: 0.5, reverbMix: 0.3, reverbSize: 2.6, master: 1.04 },
  pluckBass: { waveA: 'sawtooth', waveB: 'square', levelA: 0.65, levelB: 0.35, cutoff: 448, reso: 6, filterEnvAmt: 2600, a: 0.002, d: 0.2, s: 0.0, r: 0.13, master: 2.36 },
  squareLead: { waveA: 'square', waveB: 'square', pulseWidth: 0.35, detuneB: 6, levelA: 0.5, levelB: 0.5, cutoff: 2520, reso: 2, a: 0.01, d: 0.15, s: 0.8, r: 0.2, dlyAmt: 0.2, width: 0.25, master: 1 },
  kick808: { waveA: 'fm4', levelA: 1, levelB: 0, fm4Alg: '0', fm4R1: 1, fm4L1: 1, fm4D1: 4, fm4R2: 1, fm4L2: 0.9, fm4D2: 0.03, fm4R3: 0.5, fm4L3: 0.5, fm4D3: 0.02, fm4R4: 1, fm4L4: 0, fm4D4: 4,
    pitchEnvAmt: 700, pitchEnvDec: 0.04, cutoff: 2500, envCurve: 1, a: 0, d: 0.55, s: 0.0, r: 0.3, dist: 0.3, master: 2.02 },
  dxEpVel: { waveA: 'sine', waveB: 'sine', levelA: 0.6, levelB: 0.4, fmRatio: 1, fmIndex: 0.5, mx1src: 'vel', mx1dst: 'fm', mx1amt: 0.2, mx2src: 'env', mx2dst: 'fm', mx2amt: 0.15,
    fenvMode: 'own', fa: 0.002, fd: 0.12, fs: 0.0, fr: 0.2, a: 0.002, d: 0.9, s: 0.25, r: 0.4, chAmt: 0.25, chSpd: 0.5, width: 0.3, reverbMix: 0.22, master: 0.65 },
};

// Perceived loudness: BS.1770 K-weighting (shelf + high-pass), maximum over 400 ms blocks
// (≈ momentary max), between samples i0 and i1 of a stereo buffer
const biq = (b0, b1, b2, a1, a2) => x => { const y = new Float32Array(x.length); let x1 = 0, x2 = 0, y1 = 0, y2 = 0;
  for (let i = 0; i < x.length; i++) { const v = b0 * x[i] + b1 * x1 + b2 * x2 - a1 * y1 - a2 * y2; x2 = x1; x1 = x[i]; y2 = y1; y1 = v; y[i] = v; } return y; };
const kShelf = (() => { const A = Math.pow(10, 4 / 40), w = 2 * Math.PI * 1681.97 / SR, c = Math.cos(w), al = Math.sin(w) / (2 * 0.7072), sA = 2 * Math.sqrt(A) * al, a0 = (A + 1) - (A - 1) * c + sA;
  return biq(A * ((A + 1) + (A - 1) * c + sA) / a0, -2 * A * ((A - 1) + (A + 1) * c) / a0, A * ((A + 1) + (A - 1) * c - sA) / a0, 2 * ((A - 1) - (A + 1) * c) / a0, ((A + 1) - (A - 1) * c - sA) / a0); })();
const kHp = (() => { const w = 2 * Math.PI * 38.135 / SR, c = Math.cos(w), al = Math.sin(w) / (2 * 0.5003), a0 = 1 + al; return biq((1 + c) / 2 / a0, -(1 + c) / a0, (1 + c) / 2 / a0, -2 * c / a0, (1 - al) / a0); })();
function lufs(b, i0 = 0, i1 = Infinity) {
  const l = kHp(kShelf(b.getChannelData(0))), rr = kHp(kShelf(b.getChannelData(1))), B = Math.round(0.4 * SR), H = Math.round(0.1 * SR), end = Math.min(l.length, i1);
  let best = 0; for (let i = i0; i + B <= end; i += H) { let s = 0; for (let k = i; k < i + B; k++) s += l[k] * l[k] + rr[k] * rr[k]; best = Math.max(best, s / B); }
  return best > 0 ? -0.691 + 10 * Math.log10(best) : -99;
}
// Spectral fingerprint of a buffer: energy (dB) in 24 third-octave bands (50 Hz – 12.8 kHz)
// over three windows [t0, t1), each vector centred on its own mean (level-independent).
// The distance between two presets is the RMS of the dB differences.
const FP_BANDS = Array.from({ length: 24 }, (_, i) => 50 * Math.pow(2, i / 3));
function fingerprint(b, windows) {
  const L = b.getChannelData(0), R = b.getChannelData(1), n = L.length, mono = new Float32Array(n);
  for (let i = 0; i < n; i++) mono[i] = 0.5 * (L[i] + R[i]);
  const out = [];
  for (const fc of FP_BANDS) {
    const w = 2 * Math.PI * fc / SR, al = Math.sin(w) / (2 * 4.3), a0 = 1 + al;   // band-pass, Q ≈ 4.3 (a third of an octave)
    const y = biq(al / a0, 0, -al / a0, -2 * Math.cos(w) / a0, (1 - al) / a0)(mono);
    for (const [t0, t1] of windows) { let e = 0; const i0 = Math.max(0, Math.floor(t0 * SR)), i1 = Math.min(n, Math.floor(t1 * SR)); for (let i = i0; i < i1; i++) e += y[i] * y[i]; out.push(10 * Math.log10(e / Math.max(1, i1 - i0) + 1e-12)); }
  }
  const mean = out.reduce((a, v) => a + v, 0) / out.length;
  return out.map(v => v - mean);
}
const fpDistance = (a, b) => Math.sqrt(a.reduce((s, v, i) => s + (v - b[i]) * (v - b[i]), 0) / a.length);

// A factory preset measured in its USE (docs/BANK.md): one note at `root`, a major triad or
// one hit, sequencer and arpeggiator off (they run on the wall clock). Returns the row for the
// panel, the numbers for the ping (with the Master that would land it on TARGET) and the fingerprint.
// SIM_MIN_DB: the closest pair allowed. First measurement (2026-10-26): median 16.8 dB, closest
// 1.8 (Cathedral Pad / Supersaw Pad — the fingerprint is the spectral envelope, not the motion)
const TARGET_LUFS = -14, HIT_PEAK_DB = -4, SIM_MIN_DB = 1.5;
async function measurePreset(cat, p) {
  const name = p.name, problems = [], m = { ...p, cat }, use = p.use, root = rootOf(m);
  const badKeys = Object.keys(p.data).filter(k => !(k in CONTROLS));
  if (badKeys.length) problems.push('unknown keys: ' + badKeys.join(', '));
  if (!Object.keys(p.data).length) return { row: { name: cat + ' / ' + name, peak: 0, ok: !problems.length, problems } };   // Init = Reset
  const f0 = n => 440 * Math.pow(2, (n - 69) / 12), dBv = v => (v > 1e-9 ? 20 * Math.log10(v) : -99);
  let peak = 0, info = { use };
  try {
    loadState(p.data);
    const S = structuredClone(engine.S); S.seqOn = 'off'; S.arpMode = 'off';
    const notes = (use === 'chord' ? [root, root + 4, root + 7] : [root]).map(f0);
    const hold = use === 'hit' ? 0.05 : Math.min(20, Math.max(1.5, S.a + S.d + 1.5));   // the real sustain (1.1.0 lesson), not a fixed window
    const after = use === 'hit' ? 2 : Math.min(2, S.r + 0.3);
    const ctx = new OfflineAudioContext(2, Math.ceil(SR * (hold + after)), SR);
    const eng = new AudioEngine(); eng.S = S; await eng.init(ctx);
    notes.forEach((f, i) => eng.noteOn('n' + i, f, 1));
    ctx.suspend(hold).then(() => { notes.forEach((f, i) => eng.noteOff('n' + i)); ctx.resume(); });
    const b = await ctx.startRendering(), a = analyze(b);
    peak = a.peak;
    if (a.bad) problems.push(a.bad + ' NaN/Inf samples');
    else if (peak <= SILENCE) problems.push('silence (peak ' + dB(peak) + ')');
    const L = b.getChannelData(0), R = b.getChannelData(1), W = Math.round(0.01 * SR), TOP = Math.pow(10, -1.3 / 20);
    const span = use === 'hit' ? L.length : Math.floor(hold * SR);
    let hot = 0, n10 = 0;
    for (let i = 0; i + W <= span; i += W, n10++) { let pk = 0; for (let k = i; k < i + W; k++) pk = Math.max(pk, Math.abs(L[k]), Math.abs(R[k])); if (pk > TOP) hot++; }
    info.clip = +(100 * hot / Math.max(1, n10)).toFixed(1);
    info.peak = +dBv(peak).toFixed(1);
    info.master = S.master;
    if (use === 'hit') {
      info.lufs = +lufs(b).toFixed(1);
      info.sugg = +Math.min(4, S.master * Math.pow(10, (HIT_PEAK_DB - info.peak) / 20)).toFixed(2);
      if (Math.abs(info.peak - HIT_PEAK_DB) > 2) problems.push('peak ' + info.peak + ' dBFS (hits aim at ' + HIT_PEAK_DB + ' ± 2)');
    } else {
      info.lufs = +lufs(b, 0, span).toFixed(1);
      const ceiling = use === 'chord' ? -3 : -5;   // room for a fourth note / a tied note before the limiter
      const byLoud = S.master * Math.pow(10, (TARGET_LUFS - info.lufs) / 20), byPeak = S.master * Math.pow(10, (ceiling - info.peak) / 20);
      info.sugg = +Math.min(4, byLoud, byPeak).toFixed(2);
      if (Math.abs(info.lufs - TARGET_LUFS) > 3 && Math.abs(info.sugg - S.master) / S.master > 0.06) problems.push(info.lufs + ' LUFS (−14 ± 3): Master ' + S.master + ' → ' + info.sugg);
      if (info.clip >= 3) problems.push('the limiter works on ' + info.clip + ' % of the sustain (peak ' + info.peak + ' dBFS)');
      // DC: mean of the last 400 ms of the sustain against the peak
      let s = 0; const i0 = Math.max(0, span - Math.round(0.4 * SR)); for (let i = i0; i < span; i++) s += L[i] + R[i];
      info.dc = +(100 * Math.abs(s / (2 * Math.max(1, span - i0))) / Math.max(1e-9, peak)).toFixed(2);
      if (info.dc > 1) problems.push('DC ' + info.dc + ' % of the peak');
    }
    // the dry tail: a short second render without space FX — after the release the voice must be gone
    if (use !== 'hit' && S.r <= 5) {
      const S2 = { ...S, reverbMix: 0, dlyAmt: 0, shimAmt: 0 }, h2 = Math.min(1.5, Math.max(0.5, S.a + 0.3)), len = h2 + S.r + 0.4;
      const c2 = new OfflineAudioContext(2, Math.ceil(SR * len), SR);
      const e2 = new AudioEngine(); e2.S = S2; await e2.init(c2);
      notes.forEach((f, i) => e2.noteOn('n' + i, f, 1));
      c2.suspend(h2).then(() => { notes.forEach((f, i) => e2.noteOff('n' + i)); c2.resume(); });
      const b2 = await c2.startRendering(), l2 = b2.getChannelData(0), r2 = b2.getChannelData(1);
      let pAll = 0, pEnd = 0; const iEnd = l2.length - Math.round(0.05 * SR);
      for (let i = 0; i < l2.length; i++) { const v = Math.max(Math.abs(l2[i]), Math.abs(r2[i])); if (v > pAll) pAll = v; if (i >= iEnd && v > pEnd) pEnd = v; }
      info.tail = +(dBv(pEnd) - dBv(pAll)).toFixed(1);
      if (info.tail > -50) problems.push('still sounding ' + (0.4).toFixed(1) + ' s after the release (' + info.tail + ' dB below the peak)');
    }
    const wins = use === 'hit' ? [[0, 0.05], [0.05, 0.25], [0.25, 0.6]] : [[0, 0.25], [hold * 0.7 - 0.125, hold * 0.7 + 0.125], [hold, hold + 0.25]];
    info.print = fingerprint(b, wins);
  } catch (e) {
    problems.push('exception: ' + ((e && e.message) || e));
  }
  return { row: { name: cat + ' / ' + name, peak, problems, ok: problems.length === 0 }, info };
}

async function testPreset(name, data) {
  const problems = [];
  const badKeys = Object.keys(data).filter(k => !(k in CONTROLS));
  if (badKeys.length) problems.push('unknown keys: ' + badKeys.join(', '));
  let peak = 0;
  try {
    loadState(data);                        // applies the preset through the real path (UI -> S)
    const r = await renderState(structuredClone(engine.S));
    peak = r.peak;
    if (r.bad) problems.push(r.bad + ' NaN/Inf samples');
    else if (peak <= SILENCE) problems.push('silence (peak ' + dB(peak) + ')');
    else if (peak > 1.0) problems.push('clipping (peak ' + dB(peak) + ')');
  } catch (e) {
    problems.push('exception: ' + ((e && e.message) || e));
  }
  return { name, peak, problems, ok: problems.length === 0 };
}

// ---------- results panel ----------
function el(cls, text) {
  const d = document.createElement('div');
  d.className = cls;
  if (text) d.textContent = text;
  return d;
}
function makePanel() {
  const p = document.createElement('div');
  p.id = 'selftestPanel';
  p.innerHTML =
    '<div class="st-head"><b>Self-test</b><span id="stSummary">preparing…</span>' +
    '<button id="stClose" title="Close">✕</button></div><div id="stBody"></div>';
  document.body.appendChild(p);
  p.querySelector('#stClose').addEventListener('click', () => p.remove());
  return p;
}
function addRow(body, r) {
  const row = el('st-row ' + (r.ok ? 'ok' : 'fail'));
  row.appendChild(el('st-mark', r.ok ? '✓' : '✗'));
  row.appendChild(el('st-name', r.name));
  row.appendChild(el('st-peak', dB(r.peak)));
  body.appendChild(row);
  if (!r.ok) body.appendChild(el('st-err', r.problems.join(' · ')));
  body.scrollTop = body.scrollHeight;
}

export async function runSelfTest() {
  const t0 = performance.now();
  const panel = makePanel();
  const body = panel.querySelector('#stBody');
  const summary = panel.querySelector('#stSummary');
  await presetBankReady();   // seeding the repo banks is asynchronous: the selector must be complete before counting

  // duplicate names in the bank (the preset lookup is flat, by name)
  const seen = new Set(), dups = [];
  for (const cat in FACTORY) for (const name in FACTORY[cat]) {
    if (seen.has(name)) dups.push(name); else seen.add(name);
  }
  if (dups.length) body.appendChild(el('st-err', 'Duplicate names in FACTORY: ' + dups.join(', ')));

  const results = [];
  let ok = 0;
  const push = r => { results.push(r); if (r.ok) ok++; addRow(body, r); };
  // BATCHES (?batch=checks | ?batch=factory). Hundreds of OfflineAudioContexts in ONE page
  // hang it with no error — neither the timers nor the debugger respond: it got stuck at
  // render ~330, on any preset — because each one drags along its worklet thread and
  // it is not released in time (not even calling gc() every 5 renders). Each batch stays under
  // the limit and the runner (tools/run-selftest.mjs) runs each one in a fresh browser. Without
  // ?batch everything runs in a row on the same page, as before: it may not reach the end.
  const BATCH = new URLSearchParams(location.search).get('batch');
  const inBatch = t => !BATCH || BATCH === t;

  if (inBatch('checks')) {   // ---------- «checks» batch: everything but the factory bank ----------
  // static check: migration of v1 user presets (cutoff 0..1) -> v2 (Hz)
  {
    body.appendChild(el('st-cat', 'Static'));
    const m = migrateV1({ cutoff: 0.5, reso: 3 }), keep = migrateV1({ cutoff: 6000 });
    const okM = m.reso === 3 && Math.abs(m.cutoff - 632.5) < 2 && keep.cutoff === 6000;
    push({ name: 'preset migration v1→v2', peak: 0, ok: okM,
           problems: okM ? [] : ['migrateV1: ' + JSON.stringify([m, keep])] });
  }
  {
    // mixer (1.2.0): Mix A↔B and Ring as a crossfade → independent levels,
    // with the SAME coefficients: (1−ring)(1−mix), (1−ring)·mix and ring
    const problems = [], eq = (o, a, b) => o.levelA === a && o.levelB === b && !('mix' in o);
    const cases = [
      [migrateMix({ mix: 0.35 }), 0.65, 0.35, 'Mix only'],
      [migrateMix({ mix: 0.5, ring: 0.3 }), 0.35, 0.35, 'Mix + Ring'],
      [migrateMix({ ring: 0.8 }), 0.12, 0.08, 'Ring without Mix (the Mix 0.4 of the old base)'],
      [withPresetBase({ mix: 0 }), 1, 0, 'Mix 0 over the base'],
    ];
    for (const [o, a, b, what] of cases) if (!eq(o, a, b)) problems.push(what + ': ' + JSON.stringify(o));
    const newPreset = { levelB: 0.3, ring: 0.5 };
    if (migrateMix(newPreset) !== newPreset) problems.push('a preset with levels is left untouched');
    if (!('levelA' in withPresetBase({ cutoff: 1000 })) || withPresetBase({ cutoff: 1000 }).levelA !== PRESET_BASE.levelA) problems.push('no Mix or Ring: the base levels');
    if (Object.keys(withPresetBase({})).length) problems.push('{} is no longer Reset');
    for (const cat in FACTORY) for (const n in FACTORY[cat]) {
      const p = FACTORY[cat][n];
      if ('mix' in p) problems.push(n + ': factory preset with Mix');
      if (p.ring > 0 && !('levelA' in p && 'levelB' in p)) problems.push(n + ': Ring without levels (it would be read as an old one)');
    }
    push({ name: 'mixer migration (Mix/Ring → levels A, B, Ring)', peak: 0, ok: !problems.length, problems: problems.slice(0, 4) });
  }
  {
    // arpeggiator: 'up' sequence over 2 octaves sorted by pitch
    const a = new Arp({ S: { arpOct: '2' }, ctx: null });
    a.held = [{ id: 1, freq: 200, vel: 1 }, { id: 2, freq: 100, vel: 1 }];
    const seq = a._seq().map(n => n.freq).join(',');
    const okA = seq === '100,200,200,400';
    push({ name: 'arpeggiator (×2 oct sequence)', peak: 0, ok: okA, problems: okA ? [] : ['seq: ' + seq] });
  }
  {
    // Common clock (Roadmap 7.0 · 0.4). (1) The arithmetic: exact grid, a new BPM
    // does not move the current beat, the first one to join sets the origin and the others
    // go to the grid. (2) In real time (the Arp and the Seq run on a timer: they do not
    // run offline), two engines on one context with _directOn intercepted:
    // playing by hand, the arpeggio sounds +30 ms after the key (no added delay) and
    // a Seq that comes in 130 ms later lands on ITS grid (|Δ| < 1 sample); with the
    // origin anchored the way the conductor anchors it, a key with a time (a
    // Player's) starts EXACTLY there, not wherever a timer falls; and after
    // going from 120 to 90 BPM the steps stay on the grid, with no gap or jump.
    const problems = [];
    const fake = { currentTime: 10 }, c = new Clock(fake);
    c.anchor('d', 10, 120);
    if (Math.abs(c.nextGrid(10.2, 0.25) - 10.25) > 1e-9 || Math.abs(c.nextGrid(10.25, 0.25) - 10.25) > 1e-9) problems.push('nextGrid: ' + c.nextGrid(10.2, 0.25) + ' / ' + c.nextGrid(10.25, 0.25));
    if (c.stepAt(10.37, 0.25) !== 2) problems.push('stepAt: ' + c.stepAt(10.37, 0.25));
    const b0 = c.beatAt(11.3); c.setBpm(90, 11.3);
    if (Math.abs(c.beatAt(11.3) - b0) > 1e-9 || Math.abs(c.beatLen() - 60 / 90) > 1e-12) problems.push('setBpm: the current beat jumps ' + (c.beatAt(11.3) - b0));
    const c2 = new Clock(fake), t1 = c2.join('a', 5.03, 0.25, 120), t2 = c2.join('b', 5.17, 0.5, 120);
    if (t1 !== 5.03 || Math.abs(t2 - 5.28) > 1e-9) problems.push('join: ' + t1 + ' / ' + t2);
    // Parts: the BPM knob only reaches the S of the chosen part; every part's tempo is the room's
    try {
      const scB = await createScene(new OfflineAudioContext(2, 128, SR), []);
      scB.parts[0].engine.set('bpm', 97);
      const bpms = scB.parts.map(p => p.engine.bpm);
      if (!bpms.every(b => b === 97)) problems.push('Parts: the room BPM does not reach all of them (' + bpms.join(', ') + ')');
    } catch (e2) { problems.push('Parts: ' + ((e2 && e2.message) || e2)); }
    let live = null;
    try {
      live = new AudioContext(); await live.resume();
      const mk = (S) => { const e = new AudioEngine(); e.ctx = live; e.ready = true; Object.assign(e.S, S); e.log = [];
        e._directOn = (id, f, v, when) => e.log.push(when); e._directOff = () => {}; e.allNotesOff = () => {}; return e; };
      const eA = mk({ arpMode: 'up', arpDiv: '1/16', bpm: 120 }), eB = mk({ seqOn: 'on', seqPat: '0 3 7 12', seqDiv: '1/8', bpm: 120 });
      const clk = clockOf(live), wait = ms => new Promise(r => setTimeout(r, ms));
      const tHold = live.currentTime; eA.noteOn('k', 220, 1);
      await wait(130); eB.noteOn('k', 110, 1);
      await wait(420);
      const off = (t, div) => { const x = (t - clk.origin) / (div * clk.beatLen()); return Math.abs(x - Math.round(x)) * div * clk.beatLen(); };
      if (!(Math.abs(eA.log[0] - (tHold + 0.03)) < 0.002)) problems.push('by hand: the arpeggio starts ' + ((eA.log[0] - tHold) * 1000).toFixed(1) + ' ms after the key (expected 30)');
      const dA = Math.max(...eA.log.map(t => off(t, 0.25))), dB = Math.max(...eB.log.map(t => off(t, 0.5)));
      if (!(eA.log.length >= 4 && eB.log.length >= 2)) problems.push('too few steps: Arp ' + eA.log.length + ' · Seq ' + eB.log.length);
      if (!(dA < 0.5 / SR && dB < 0.5 / SR)) problems.push('off the grid: Arp ' + (dA * SR).toFixed(2) + ' · Seq ' + (dB * SR).toFixed(2) + ' samples');
      eA.noteOff('k'); eB.noteOff('k');
      // the conductor anchors; a key with a time (beat 2) starts exactly there
      clk.anchor('director', live.currentTime + 0.05, 120);
      const eC = mk({ arpMode: 'up', arpDiv: '1/16', bpm: 120 }), when = clk.timeAt(2);
      eC.noteOn('j', 330, 1, when);
      await wait(1150);
      if (!(eC.log.length && Math.abs(eC.log[0] - when) < 0.5 / SR)) problems.push('player: the key with a time starts ' + (eC.log.length ? ((eC.log[0] - when) * 1000).toFixed(2) + ' ms' : 'never') + ' from its beat');
      // tempo change while running
      const nBefore = eC.log.length; clk.setBpm(90, live.currentTime); eC.S.bpm = 90;
      await wait(500);
      const after = eC.log.slice(nBefore), gaps = after.slice(1).map((t, i) => t - after[i]);
      const dC = Math.max(...after.map(t => off(t, 0.25)));
      if (!(after.length >= 3 && dC < 0.5 / SR && gaps.every(g => Math.abs(g - 0.25 * 60 / 90) < 1e-6))) problems.push('after 120 → 90 BPM: ' + after.length + ' steps, off the grid ' + (dC * SR).toFixed(2) + ' samples, gaps ' + gaps.map(g => (g * 1000).toFixed(1)).join(' ') + ' ms');
      eC.noteOff('j'); clk.leave('director');
      console.log('common clock: by hand +' + ((eA.log[0] - tHold) * 1000).toFixed(1) + ' ms · Arp/Seq off the grid ' + (dA * SR).toFixed(3) + ' / ' + (dB * SR).toFixed(3) + ' samples · player Δ ' + ((eC.log[0] - when) * SR).toFixed(3) + ' samples · after 90 BPM ' + (dC * SR).toFixed(3));
    } catch (e2) { problems.push('exception: ' + ((e2 && e2.message) || e2)); }
    finally { if (live) live.close(); }
    push({ name: 'common clock (grid · BPM without jumps · Arp and Seq together · the player\'s key on its beat)', peak: 0, ok: !problems.length, problems });
  }
  {
    // sequencer: pattern parser (rests, invalid tokens, ± clamp, phase-2 suffixes, 16 cap)
    const p1 = parsePattern('0 3 7 12 . 7 3 .').map(s => s ? s.off : '.').join(',');
    const p2 = parsePattern('x 1.5 40 -40 7! 5~');
    const okP = p1 === '0,3,7,12,.,7,3,.'
      && p2[0] === null && p2[1] === null && p2[2].off === 24 && p2[3].off === -12
      && p2[4].off === 7 && p2[4].accent && p2[5].off === 5 && p2[5].tie
      && parsePattern('').length === 0
      && parsePattern(Array(20).fill('0').join(' ')).length === 16;
    push({ name: 'sequencer (pattern parser)', peak: 0, ok: okP, problems: okP ? [] : ['p1: ' + p1 + ' p2: ' + JSON.stringify(p2)] });
  }
  {
    // sequencer: chromatic transposition (root × 2^(semis/12))
    const okT = Math.abs(stepFreq(110, 12) - 220) < 1e-9 && stepFreq(110, 0) === 110
      && Math.abs(stepFreq(220, -12) - 110) < 1e-9 && Math.abs(stepFreq(261.63, 7) - 391.995) < 0.02;
    push({ name: 'sequencer (transposition)', peak: 0, ok: okT, problems: okT ? [] : ['stepFreq'] });
  }
  {
    // sequencer: last-note root, latch and retrig (no ctx, like the arp test)
    const problems = [];
    const q = new Seq({ S: { seqLatch: 'on', seqRetrig: 'on' }, ctx: null });
    q.held = [{ id: 1, freq: 100, vel: 1 }, { id: 2, freq: 200, vel: 0.8 }];
    if (q._root().freq !== 200) problems.push('last-note priority');
    q.unhold(2);
    if (q._root().freq !== 100) problems.push('back to the previous note');
    q.unhold(1);
    if (!q._root() || q._root().freq !== 100 || q._root().vel !== 1) problems.push('latch does not capture the last one');
    q.timer = 1; q.idx = 5; q.hold(3, 300, 1);   // branch with a live timer: does not touch ctx
    if (q.idx !== 0 || q._root().freq !== 300) problems.push('retrig does not restart the phrase');
    const q2 = new Seq({ S: { seqLatch: 'off', seqRetrig: 'off' }, ctx: null });
    q2.held = [{ id: 1, freq: 100, vel: 1 }];
    q2.unhold(1);
    if (q2._root() !== null) problems.push('without latch it should be left with no root');
    push({ name: 'sequencer (root/latch/retrig)', peak: 0, ok: !problems.length, problems });
  }
  {
    // step marker: selection by the audio clock and pruning of expired steps
    const q = new Seq({ S: {}, ctx: { currentTime: 1.0 } });
    q.timer = 1;
    q.playQ = [{ i: 2, t0: 0.5, t1: 0.9 }, { i: 3, t0: 0.9, t1: 1.3 }, { i: 4, t0: 1.3, t1: 1.7 }];
    const a = q.playingStep();                               // t=1.0: prunes i=2, i=3 is sounding
    const q2 = new Seq({ S: {}, ctx: { currentTime: 0 } });  // stopped (no timer) → -1
    const okM = a === 3 && q.playQ.length === 2 && q2.playingStep() === -1;
    push({ name: 'sequencer (step marker)', peak: 0, ok: okM,
           problems: okM ? [] : ['playingStep: ' + a + ' len ' + q.playQ.length] });
  }
  {
    // phrase bank: valid tokens, ≤16 steps, some note, offsets in range, unique names
    const bad = [], names = new Set();
    for (const p of SEQ_PATTERNS) {
      const toks = p.pat.trim().split(/\s+/), st = parsePattern(p.pat);
      if (!toks.length || toks.length > 16) bad.push(p.name + ': length ' + toks.length);
      if (!toks.every(t => t === '.' || /^-?\d+(?:!|~|\/|x[1-4])*$/.test(t))) bad.push(p.name + ': invalid token');   // articulation suffixes (5.1)
      if (!st.some(Boolean)) bad.push(p.name + ': no notes');
      if (st.some((s, i) => s && s.off !== parseInt(toks[i], 10))) bad.push(p.name + ': offset out of range');
      if (!['1/4', '1/8', '1/16'].includes(p.div)) bad.push(p.name + ': div ' + p.div);
      if (p.bpm != null && !(p.bpm >= 40 && p.bpm <= 220)) bad.push(p.name + ': bpm ' + p.bpm);
      if (names.has(p.name)) bad.push(p.name + ': duplicate name'); names.add(p.name);
    }
    push({ name: 'sequencer (phrase bank)', peak: 0, ok: !bad.length, problems: bad });
  }
  {
    // WAV encoder: header and size (44 bytes + n·4 in 16-bit stereo)
    const blob = encodeWav([new Float32Array(128)], [new Float32Array(128)], 44100);
    const okW = blob.size === 44 + 128 * 4 && blob.type === 'audio/wav';
    push({ name: 'WAV encoder', peak: 0, ok: okW, problems: okW ? [] : ['blob: ' + blob.size + ' ' + blob.type] });
  }
  {
    // SFZ exporter: a minimal kit through the real path (2 offline renders →
    // trim + normalization → WAVs + .sfz text → zip). Default state:
    // filterEnvAmt=0 ⇒ 1 layer; A3..A4 grid ⇒ 2 samples.
    let r;
    try {
      loadState({});
      const kit = await makeSfzKit(structuredClone(engine.S), 'Selftest',
        { lo: 57, hi: 69, step: 12, hold: 0.3, maxDur: 1.2 });
      const regions = (kit.sfz.match(/<region>/g) || []).length;
      const okN = kit.samples.length === 2 && regions === 2 && kit.layers === 1;
      const okWav = kit.samples.every(s => s.bytes.length > 44 + 2000 &&
        s.bytes[0] === 0x52 && s.bytes[1] === 0x49 && s.bytes[2] === 0x46 && s.bytes[3] === 0x46);
      const okRef = kit.samples.every(s => kit.sfz.includes('sample=' + s.fname));
      const okRange = kit.sfz.includes('lokey=0') && kit.sfz.includes('hikey=127');
      const zip = new Uint8Array(await makeZip([
        { name: kit.slug + '.sfz', data: new TextEncoder().encode(kit.sfz) },
        ...kit.samples.map(s => ({ name: 'samples/' + s.fname, data: s.bytes })),
      ]).arrayBuffer());
      const okZip = zip[0] === 0x50 && zip[1] === 0x4b && zip[2] === 3 && zip[3] === 4;
      // PCM peak of the first sample: neither silent nor saturated (normalizes to −1 dB)
      const dvS = new DataView(kit.samples[0].bytes.buffer, kit.samples[0].bytes.byteOffset + 44);
      let pk = 0;
      for (let i = 0; i < (kit.samples[0].bytes.length - 44) / 2; i++) {
        const v = Math.abs(dvS.getInt16(i * 2, true)); if (v > pk) pk = v;
      }
      const okPk = pk > 327 && pk <= 32767;
      // MEASURED velocity layers: a preset whose velocity moves FM through the matrix (it used
      // to come out with ONE layer: only the filter env was looked at) gives ≥ 2, with the soft one raised in level
      loadState(FX.dxEpVel);
      const vl = await velocityLayers(structuredClone(engine.S), 1.2);
      const okVel = vl.layers.length >= 2 && vl.layers[0].gain > 1;
      console.log('sfz layers: Reset Δ ' + kit.timbre.toFixed(1) + ' dB →', kit.layers, '· DX E-Piano Δ ' + vl.timbre.toFixed(1), 'dB →', vl.layers.length, '(soft gain ×' + vl.layers[0].gain.toFixed(2) + ')');
      loadState({});
      const okS = okN && okWav && okRef && okRange && okZip && okPk && okVel;
      r = { name: 'SFZ exporter (render → sfz + zip · measured velocity layers)', peak: pk / 32767, ok: okS,
            problems: okS ? [] : ['n:' + okN + ' wav:' + okWav + ' ref:' + okRef +
                                  ' range:' + okRange + ' zip:' + okZip + ' peak:' + okPk + ' vel layers:' + okVel + ' (' + vl.layers.length + ')'] };
    } catch (e) {
      r = { name: 'SFZ exporter (render → sfz + zip)', peak: 0, ok: false,
            problems: ['exception: ' + ((e && e.message) || e)] };
    }
    push(r);
  }
  {
    // MIDI mapping: CC→value conversion (linear and log) and discrete zones
    const okM =
      Math.abs(ccToVal(PARAMS.cutoff, 1) - 20000) < 0.5 &&      // log: top end
      Math.abs(ccToVal(PARAMS.cutoff, 0) - 20) < 0.01 &&        // log: bottom end
      Math.abs(ccToVal(PARAMS.detuneA, 0.5)) < 1e-9 &&          // linear: center of ±50
      zoneOf(['a', 'b', 'c'], 0) === 'a' && zoneOf(['a', 'b', 'c'], 0.34) === 'b' &&
      zoneOf(['a', 'b', 'c'], 1) === 'c';
    push({ name: 'MIDI mapping (CC→value and zones)', peak: 0, ok: okM,
           problems: okM ? [] : ['ccToVal/zoneOf return unexpected values'] });
  }
  {
    // MIDI learn end to end: bind a CC, move a real control (continuous and
    // by zones), per-device persistence in localStorage and pickup mode
    const prevDev = getDevice();
    const K = 'subsdj.midimap.v1:selftest';
    localStorage.removeItem(K);
    setDevice('selftest');                        // clean (factory) map for the fake device
    armLearn('reso'); learnCapture(33);
    applyCC(33, 1);
    const okBind = Math.abs(CONTROLS.reso.get() - 24) < 0.11;   // top of the range (step 0.1)
    armLearn('waveA'); learnCapture(34);
    applyCC(34, 0.36);                            // zone 3 of 7 → 'sine' (7 waves since FM4: 0.36·7 = 2.5 → index 2)
    const okZone = CONTROLS.waveA.get() === 'sine';
    const okFree = applyCC(99, 1) === false;      // an unbound CC is not consumed
    setDevice('selftest');                        // rereads from localStorage: the binding survives
    const okPersist = !!getMap().ccs[33] && getMap().ccs[33].id === 'reso' && !getMap().ccs[71];
    getMap().pickup = true;                       // pickup: far away and without crossing it does NOT jump…
    CONTROLS.levelB.set(0.5);
    armLearn('levelB'); learnCapture(35);
    applyCC(35, 0.9);
    const okHold = Math.abs(CONTROLS.levelB.get() - 0.5) < 1e-9;
    applyCC(35, 0.4);                             // …but crossing 0.5 it catches
    const okCross = Math.abs(CONTROLS.levelB.get() - 0.4) < 1e-9;
    // a map saved before the mixer (CC → 'mix') still moves its successor
    localStorage.setItem(K, JSON.stringify({ pickup: false, ccs: { 36: { id: 'mix', lo: 0, hi: 1 } } }));
    setDevice('selftest');
    const okRen = !!getMap().ccs[36] && getMap().ccs[36].id === 'levelB';
    localStorage.removeItem(K);
    setDevice(prevDev);                           // restores the user's real map
    const okL = okBind && okZone && okFree && okPersist && okHold && okCross && okRen;
    push({ name: 'MIDI learn (bind · zones · persistence · pickup · renamed keys)', peak: 0, ok: okL,
           problems: okL ? [] : ['bind:' + okBind + ' zone:' + okZone + ' free:' + okFree +
                                 ' persist:' + okPersist + ' pickup:' + okHold + '/' + okCross + ' mix→levelB:' + okRen] });
  }
  {
    // MIDI actions on the bank: ‹ › on the rising edge and program change
    const prevDev = getDevice();
    const K = 'subsdj.midimap.v1:selftest2';
    localStorage.removeItem(K);
    setDevice('selftest2');
    const nav = navIds(), n = nav.length;         // ‹ › and program change walk the library in order
    const i0 = Math.max(0, nav.indexOf(currentPresetId()));
    const at = i => nav[((i % n) + n) % n];
    armLearn('presetNext'); learnCapture(36);
    applyCC(36, 1);                               // press (127) → next preset
    const okStep = currentPresetId() === at(i0 + 1);
    applyCC(36, 1);                               // held: does NOT repeat
    const okOnce = currentPresetId() === at(i0 + 1);
    applyCC(36, 0); applyCC(36, 1);               // release and press → advances again
    const okEdge = currentPresetId() === at(i0 + 2);
    loadPresetIndex(i0 + 130);                    // program change: modulo the library size
    const okPC = currentPresetId() === at(i0 + 130);
    localStorage.removeItem(K);
    setDevice(prevDev);
    const okA = okStep && okOnce && okEdge && okPC;
    push({ name: 'MIDI actions (bank: ‹ › and program change)', peak: 0, ok: okA,
           problems: okA ? [] : ['step:' + okStep + ' once:' + okOnce + ' edge:' + okEdge + ' pc:' + okPC] });
  }
  {
    // screens (fixed panel): each tab is its own .screen, in the order of
    // SCREENS, and every .panel lives inside one. Switching tabs shows
    // EXACTLY its body (computed style), marks the tab and is remembered;
    // the shared modules (data-slot) move to the slot of the screen that
    // declares it and are visible; the header with the presets is on all of them. NOTHING
    // CLIPPED: the instrument measures what it measures (1920 × 1000) and the bands
    // hide what overflows, so one control too many would be hidden
    // silently — neither the instrument nor any band may overflow. The list
    // on the Presets screen reflects the bank and a click loads through the same
    // path as the selector and is marked as current.
    body.appendChild(el('st-cat', 'Screens'));
    const bodies = [...document.querySelectorAll('.screen')];
    const title = p => ([...(p.querySelector('h2')?.childNodes || [])].filter(n => n.nodeType === 3).map(n => n.textContent).join('') || p.id || '?').trim();   // without the LED or the «?»
    const problems = [];
    if (bodies.map(b => b.dataset.screenBody).join() !== SCREENS.join()) problems.push('bodies: ' + bodies.map(b => b.dataset.screenBody).join() + ' ≠ ' + SCREENS.join());
    const orphans = [...document.querySelectorAll('.panel')].filter(p => !p.closest('.screen')).map(title);
    if (orphans.length) problems.push('outside any screen: ' + orphans.join(', '));
    const bar = document.getElementById('presetBar'), inst = document.getElementById('inst');
    const over = (e, tol = 1) => e.scrollWidth > e.clientWidth + tol || e.scrollHeight > e.clientHeight + tol;
    const before = currentScreen();
    for (const s of SCREENS) {
      showScreen(s);
      const shown = bodies.filter(b => getComputedStyle(b).display !== 'none').map(b => b.dataset.screenBody);
      if (shown.join() !== s) problems.push(s + ': showing ' + (shown.join(', ') || 'none'));
      if (localStorage.getItem('subsdj.screen.v1') !== s) problems.push(s + ': not remembered');
      if (!document.querySelector('#screenTabs button.active[data-screen="' + s + '"]')) problems.push(s + ': tab not marked');
      for (const m of document.querySelectorAll('[data-slot]')) {
        const host = document.querySelector('.screen[data-screen-body="' + s + '"] [data-slot-host="' + m.dataset.slot + '"]');
        if (host && (m.parentElement !== host || !m.offsetParent)) problems.push(s + ': «' + m.dataset.slot + '» is not in its slot');
      }
      if (getComputedStyle(bar).display === 'none') problems.push(s + ': no preset bar');
      if (inst && over(inst)) problems.push(s + ': the instrument overflows (' + inst.scrollWidth + '×' + inst.scrollHeight + ')');
      for (const b of document.querySelectorAll('.screen[data-screen-body="' + s + '"] .band'))
        if (over(b)) problems.push(s + ': band ' + (b.id || '?') + ' clips (' + b.scrollWidth + '×' + b.scrollHeight + ' in ' + b.clientWidth + '×' + b.clientHeight + ')');
      // a module that spills out treads on its neighbor or gets cut by the band (those that scroll, like the Library, do not count)
      for (const p of document.querySelectorAll('.screen[data-screen-body="' + s + '"] .panel'))
        if (p.offsetParent && !/auto|scroll/.test(getComputedStyle(p).overflow) && over(p))
          problems.push(s + ': the module ' + title(p) + ' spills out (' + p.scrollWidth + '×' + p.scrollHeight + ' in ' + p.clientWidth + '×' + p.clientHeight + ')');
    }
    showScreen('presets');
    const items = [...document.querySelectorAll('#presetList .pl-item')];
    if (!items.length || items.length !== library.items().length) problems.push('list: ' + items.length + ' items vs ' + library.items().length + ' in the library');
    const target = items.find(b => !b.classList.contains('scene') && b.dataset.id !== currentPresetId());   // a preset (scenes load something else)
    if (target) {
      target.click();
      const curs = document.querySelectorAll('#presetList .pl-item.cur');
      if (currentPresetId() !== target.dataset.id || curs.length !== 1 || curs[0] !== target) problems.push('click does not load/mark (' + currentPresetId() + ')');
    }
    showScreen(before);
    push({ name: 'screens (fixed panel · slots · memory · nothing clipped · preset list)', peak: 0, ok: !problems.length, problems });
  }
  {
    // Nothing clipped WITH THE PARTS (2026-10-25). The screens check looks with the
    // Parts off, and then the scene modules are empty or «off»: with them on,
    // the Player spilled into the Arrangement in all its modes and the Part Mixer cut off each
    // part's M and the Room's Layer checkbox without anything failing. Here: Parts
    // on, every player mode, and no Sequencing module or band spills out.
    const NAME = 'nothing clipped with the Parts (Part Mixer · Player in every mode · Arrangement)';
    const wait = ms => new Promise(r => setTimeout(r, ms)), isOn = () => document.body.classList.contains('parts');
    const over = (e, tol = 1) => e.scrollWidth > e.clientWidth + tol || e.scrollHeight > e.clientHeight + tol;
    const title = p => ([...(p.querySelector('h2')?.childNodes || [])].filter(n => n.nodeType === 3).map(n => n.textContent).join('') || p.id || '?').trim();
    const before = currentScreen(), wasOn = isOn(), bad = new Map(), problems = [];
    try {
      showScreen('sequencing');
      if (!wasOn) { document.getElementById('partsBtn').click(); for (let i = 0; i < 50 && !isOn(); i++) await wait(100); }
      if (!isOn()) problems.push('the Parts do not turn on');
      else {
        const btns = [...document.querySelectorAll('#playerMode button')], mode0 = btns.find(b => b.classList.contains('active'));
        for (const b of btns) {
          b.click();
          for (const p of document.querySelectorAll('.screen[data-screen-body="sequencing"] .panel, .screen[data-screen-body="sequencing"] .band'))
            if (p.offsetParent && over(p)) {
              const k = (p.classList.contains('band') ? 'band ' + (p.id || '?') : title(p)) + ' (' + p.scrollWidth + '×' + p.scrollHeight + ' in ' + p.clientWidth + '×' + p.clientHeight + ')';
              bad.set(k, [...(bad.get(k) || []), b.dataset.pm]);
            }
        }
        if (mode0) mode0.click();
      }
      for (const [k, modes] of bad) problems.push(k + ' spills out · modes: ' + modes.join(', '));
    } catch (e2) { problems.push('exception: ' + ((e2 && e2.message) || e2)); }
    finally {
      if (!wasOn && isOn()) document.getElementById('partsBtn').click();
      showScreen(before);
    }
    push({ name: NAME, peak: 0, ok: !problems.length, problems });
  }
  {
    // canvas: the on-screen size is set ONLY by the CSS. fitCanvas sets the
    // backing store to size × dpr × zoom; if a canvas box took that
    // backing store as its natural width, each redraw would enlarge it another
    // ×dpr×zoom until it blew up (it happened on a 4K at 150 %: zoom 1.3 × dpr 1.5;
    // here, with dpr 1 and zoom ≤ 1, it does not grow, which is why the RULE is tested and not the
    // symptom): the backing store of every visible canvas is tripled, on every
    // screen, and its box must not move.
    const problems = [];
    const before = currentScreen();
    for (const s of SCREENS) {
      showScreen(s);
      for (const c of document.querySelectorAll('#inst canvas')) {
        if (!c.offsetParent) continue;
        const w0 = c.clientWidth, h0 = c.clientHeight, bw = c.width, bh = c.height;
        c.width = bw * 3 + 7; c.height = bh * 3 + 7;
        if (c.clientWidth !== w0 || c.clientHeight !== h0) problems.push(s + ': #' + c.id + ' ' + w0 + '×' + h0 + ' → ' + c.clientWidth + '×' + c.clientHeight);
        c.width = bw; c.height = bh;
      }
    }
    showScreen(before);   // triggers resize: the canvases are redrawn
    push({ name: 'canvas: the size is set by the CSS, not the backing store (no loop with dpr × zoom)', peak: 0, ok: !problems.length, problems });
  }
  {
    // dependencies (ui/deps.js): whatever does NOTHING with the current
    // settings is dimmed in place, with its reason. Every rule points at something that
    // exists (renaming an h2 or a control would silence it without warning; the
    // scene ones point at knobs that are born with the Parts) and a few sample
    // cases through the controls path: each one starts from Reset, touches
    // its own thing and looks at the reason (a fragment) or that it is live (null). Dimmed is not
    // blocked: the control can still be touched.
    const problems = [];
    for (const [what] of RULES) if (!/data-key/.test(what) && !depTargets(what).length) problems.push('rule without a target: ' + what);
    const keep = snapshot(), C = CONTROLS;
    const off = what => { const t = depTargets(what)[0]; return t ? (t.dataset.off || null) : 'NO TARGET'; };
    const testCase = (label, setup, checks) => {
      loadState({}); setup(); refreshDeps();
      for (const [what, want] of checks) {
        const got = off(what), ok = want === null ? got === null : !!(got && got.includes(want));
        if (!ok) problems.push(label + ': ' + what + ' → ' + (got || 'live') + ' (expected ' + (want || 'live') + ')');
      }
    };
    testCase('Reset', () => {}, [['sec:Osc A', null], ['sec:Osc B', 'Level B'], ['pulseWidth', 'Square'], ['spread', 'Supersaw'],
      ['sec:FM', 'Sine'], ['sec:FM4', 'FM4'], ['sec:Wavetable', 'Wavetable'], ['sec:Wave Editor', 'Wavetable'],
      ['noiseColor', 'Noise'], ['vocVowel', 'Mix at 0'], ['resMat', 'Mix at 0'], ['fa', 'Amount'], ['fenvMode', 'Amount'],
      ['hitGap', 'hit'], ['pitchEnvDec', 'Amt'], ['monoTrig', 'Mono'], ['uniDetune', '1 voice'], ['cutLfoSpd', 'Level'], ['lfoFade', 'vibrato'],
      ['mx1dst', 'free'], ['mx1amt', 'free'], ['flSpd', 'Fl.Amount'], ['chSpd', 'Amount'], ['dlyTime', 'Amount'],
      ['bpm', 'tempo'], ['reverbSize', 'Mix'], ['shimInt', 'Mix'], ['arpGate', 'Off'], ['seqGate', 'Off'],
      ['#seqCanvas', 'Off'], ['sec:Wave Sequence', 'Wavetable'], ['sec:Unison', null], ['levelB', null], ['cutoff', null]]);
    testCase('Osc B halfway: B sounds (square)', () => C.levelB.set(0.5), [['sec:Osc B', null], ['pulseWidth', null], ['pwmLfoLvl', null], ['pwmLfoSpd', 'Level']]);
    testCase('B only: A goes dim', () => { C.levelA.set(0); C.levelB.set(1); }, [['sec:Osc A', 'Level A'], ['sec:Osc B', null]]);
    testCase('Ring only: both sound (A×B)', () => { C.levelA.set(0); C.ring.set(1); }, [['sec:Osc A', null], ['sec:Osc B', null]]);
    testCase('Sine without index', () => C.waveA.set('sine'), [['sec:FM', null], ['fmIndex', null], ['fmRatio', 'Index'], ['fmFb', 'Index']]);
    testCase('Sine with index', () => { C.waveA.set('sine'); C.fmIndex.set(2); }, [['fmRatio', null], ['fmFb', null]]);
    testCase('Sine + env → FM index', () => { C.waveA.set('sine'); C.mx1src.set('env'); C.mx1dst.set('fm'); C.mx1amt.set(0.5); },
      [['fmRatio', null], ['mx1dst', null], ['fenvMode', null], ['fa', 'Amp Env']]);
    testCase('FM4 only: Feedback yes', () => C.waveA.set('fm4'), [['sec:FM', null], ['fmRatio', 'Sine'], ['fmIndex', 'Sine'], ['fmFb', null], ['sec:FM4', null], ['fm4R2', null]]);
    testCase('FM4 with op 3 muted', () => { C.waveA.set('fm4'); C.fm4L3.set(0); }, [['fm4R3', 'level 0'], ['fm4D3', 'level 0'], ['fm4V3', 'level 0'], ['fm4R2', null], ['fm4V2', null]]);
    testCase('Mono', () => C.mode.set('mono'), [['monoTrig', null]]);
    testCase('Wavetable without «user»', () => C.waveA.set('wavetable'), [['sec:Wavetable', null], ['sec:Wave Editor', 'user'], ['sec:Wave Sequence', null], ['wsDiv', 'Off']]);
    testCase('Wavetable «user»', () => { C.waveA.set('wavetable'); C.wtSet.set('user'); }, [['sec:Wave Editor', null]]);
    testCase('Supersaw', () => C.waveA.set('supersaw'), [['phaseA', 'Supersaw'], ['spread', null], ['sec:Unison', 'Supersaw']]);
    testCase('Unison', () => C.uniVoices.set('3'), [['uniDetune', null]]);
    testCase('Notch', () => C.filterType.set('notch'), [['morph', 'LP↔HP'], ['filterSlope', 'Notch']]);
    testCase('BP', () => C.filterType.set('bp'), [['morph', 'LP↔HP'], ['filterSlope', null]]);
    testCase('Filter Env linked', () => C.filterEnvAmt.set(2000), [['fenvMode', null], ['fa', 'Amp Env']]);
    testCase('Filter Env own', () => { C.filterEnvAmt.set(2000); C.fenvMode.set('own'); }, [['fa', null], ['fr', null]]);
    testCase('Vocal and resonator', () => { C.vocAmt.set(0.5); C.resAmt.set(0.5); }, [['vocVowel', null], ['vocAtk', null], ['resDecay', null]]);
    testCase('Matrix to Wavetable without a wavetable', () => { C.mx2src.set('lfoCut'); C.mx2dst.set('wt'); C.mx2amt.set(0.5); },
      [['mx2dst', 'Wavetable'], ['mx2amt', 'Wavetable'], ['cutLfoSpd', 'Level'], ['lfoPhase', 'in use']]);
    testCase('Raw LFO in the matrix', () => { C.mx2src.set('lfoCut'); C.mx2dst.set('pan'); C.mx2amt.set(0.5); },
      [['cutLfoSpd', null], ['cutLfoShape', null], ['lfoPhase', null], ['mx2dst', null]]);
    testCase('Slot with a source and amount 0', () => C.mx3src.set('vel'), [['mx3dst', 'amount 0'], ['mx3amt', null]]);
    testCase('Drift (voice)', () => { C.mx1src.set('drift'); C.mx1amt.set(0.3); }, [['mxDriftSpd', null]]);
    testCase('Vibrato with fade', () => C.freqLfoLvl.set(20), [['freqLfoSpd', null], ['lfoFade', null], ['lfoPhase', null]]);
    testCase('Free delay', () => C.dlyAmt.set(0.3), [['dlyTime', null], ['dlyDamp', null], ['bpm', 'tempo']]);
    testCase('Synced delay', () => { C.dlyAmt.set(0.3); C.dlySync.set('1/4'); }, [['dlyTime', 'synced'], ['bpm', null]]);
    testCase('Arpeggiator', () => C.arpMode.set('up'), [['arpGate', null], ['bpm', null]]);
    testCase('Reverb with shimmer', () => { C.reverbMix.set(0.3); C.shimAmt.set(0.4); }, [['reverbSize', null], ['shimInt', null], ['#freezeBtn', null]]);
    testCase('Flam', () => C.hits.set(3), [['hitGap', null]]);
    testCase('Drive at 0', () => {}, [['driveAsym', 'Drive at 0'], ['driveChar', 'Drive at 0']]);
    testCase('Folded drive', () => { C.filterDrive.set(0.5); C.driveChar.set('fold'); }, [['driveAsym', null], ['driveChar', null]]);
    testCase('Matrix → Drive without Drive', () => { C.mx1src.set('vel'); C.mx1dst.set('drive'); C.mx1amt.set(0.5); }, [['mx1dst', 'Drive knob'], ['mx1amt', 'Drive knob']]);
    testCase('Matrix → Level B turns B on', () => { C.mx1src.set('lfoCut'); C.mx1dst.set('lvlB'); C.mx1amt.set(0.5); }, [['sec:Osc B', null], ['mx1amt', null]]);
    testCase('Matrix → Material without Resonator', () => { C.mx1src.set('vel'); C.mx1dst.set('resMat'); C.mx1amt.set(0.5); }, [['mx1amt', 'Resonator']]);
    loadState({}); refreshDeps();
    const fr = depTargets('fmRatio')[0];
    if (!fr.closest('.dep-off')) problems.push('Reset: FM does not show as dimmed (.dep-off)');
    if (getComputedStyle(fr).pointerEvents === 'none' || getComputedStyle(fr.querySelector('.knob')).pointerEvents === 'none') problems.push('a dimmed control cannot be touched');
    loadState(keep); refreshDeps();
    push({ name: 'dependencies: whatever does nothing is dimmed in place, with its reason (' + RULES.length + ' rules)', peak: 0, ok: !problems.length, problems: problems.slice(0, 14) });
  }
  {
    // FM4 algorithm graph (ui/fm4Graph.js): its table is a COPY of the
    // worklet's (a worklet cannot be imported from the page) — if they
    // drift apart, the drawing would lie about the sound. And the layout reads as
    // on the Yamahas: each operator in its place, carriers on the bottom row,
    // each modulator above whatever it modulates. On the page, the graph
    // follows the selector (alg 5 = one modulator for three carriers).
    const problems = [];
    try {
      const src = await (await fetch('js/engine/worklets/pulse-processor.js', { cache: 'no-store' })).text();
      const m = /const FM4_ALGS = (\[[\s\S]*?\n\]);/.exec(src);
      const wk = m ? new Function('return ' + m[1])() : null;
      if (!wk) problems.push('FM4_ALGS not found in the worklet');
      else if (JSON.stringify(wk) !== JSON.stringify(FM4_ALGS)) problems.push('the graph table and the worklet table differ');
    } catch (e2) { problems.push('worklet: ' + ((e2 && e2.message) || e2)); }
    FM4_ALGS.forEach((alg, i) => {
      const pos = fm4Layout(alg), n = 'alg ' + (i + 1) + ': ';
      if (new Set(pos.map(p => p.col + ',' + p.row)).size !== 4) problems.push(n + 'operators on top of each other');
      alg.car.forEach(c => { if (pos[c].row !== 0) problems.push(n + 'carrier ' + (c + 1) + ' is not at the bottom'); });
      alg.mods.forEach((ms, t) => ms.forEach(mm => { if (!(pos[mm].row > pos[t].row)) problems.push(n + 'op ' + (mm + 1) + ' is not above op ' + (t + 1)); }));
      if (/NaN|Infinity/.test(fm4Svg(i))) problems.push(n + 'non-finite coordinates');
    });
    const keep = snapshot();
    loadState({ waveA: 'fm4', fm4Alg: '4' });
    const g = document.querySelector('#fm4Graph svg');
    if (!g || g.querySelectorAll('g.op.car').length !== 3) problems.push('the page graph does not follow the selector (alg 5 → 3 carriers)');
    loadState({ waveA: 'fm4', fmFb: 0.5 });
    if (!document.querySelector('#fm4Graph path.fb.on')) problems.push('the feedback loop does not light up with Feedback > 0');
    loadState(keep);
    push({ name: 'Yamaha-style FM4 graph: same table as the worklet, carriers below, modulators above', peak: 0, ok: !problems.length, problems });
  }
  {
    // Output display (ui/display.js): whatever does not fit shrinks the font down to its
    // minimum and, if even that fails, scrolls; the parameter name never
    // disappears (a button's whole title used to swallow the box). A seg shows
    // its SHORT value and what it means goes on the line above.
    const problems = [], keep = snapshot(), scr = currentScreen();
    showScreen('design');
    const v = document.getElementById('dispVal'), who = document.getElementById('dispWho'), side = document.getElementById('dispWhy');
    const frame = () => new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r)));
    document.dispatchEvent(new CustomEvent('preset-loaded', { detail: { name: 'Performance Pad (wheel, aftertouch, pedal) — a name that does not fit even when shrunk' } }));
    await frame();
    if (!v.clientWidth) problems.push('the Output display is not visible on Design');
    else {
      if (!v.classList.contains('scroll')) problems.push('a value that does not fit even at the minimum font size does not scroll');
      if (!(who.clientWidth > 20)) problems.push('the parameter name disappears with a long value');
    }
    const b = document.querySelector('#fm4AlgSel button[data-alg="2"]');
    b.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true })); b.click(); document.dispatchEvent(new PointerEvent('pointerup', { bubbles: true }));
    await frame();
    if (v.textContent !== '3 · 2·3·4→1') problems.push('FM4 algorithm: value «' + v.textContent + '» (expected the short «3 · 2·3·4→1»)');
    if (v.clientWidth && v.classList.contains('scroll')) problems.push('the short algorithm value does not fit');
    if (!side.textContent) problems.push('the line above says nothing (neither what it means nor why it does nothing)');
    loadState(keep); showScreen(scr);
    push({ name: 'Output display: long text shrinks or scrolls, the parameter is always visible', peak: 0, ok: !problems.length, problems });
  }
  {
    // voice CPU budget (AudioEngine.VOICE_BUDGET): SHARED by the engines
    // of one context — the 4 parts of a scene share an audio thread.
    // Offline it does not act (there are no deadlines), so live is simulated without
    // rendering: a 4-part scene with offline = false. Part 1 HOLDS 8
    // notes; part 2 plays 10 and releases them (tails); part 3 plays too many. The cap
    // is never exceeded; tails go first of all, the oldest first, from any
    // part; then the oldest pressed voice of the part asking for the note — never
    // a held note of another part. And offline there is no cap.
    const problems = [];
    try {
      const ctx = new OfflineAudioContext(2, SR, SR);
      const st = { waveA: 'sawtooth', waveB: 'sawtooth', levelA: 0.5, levelB: 0.5, vocAmt: 0.6 };
      const sc = await createScene(ctx, [st, st, st, st]);
      const E = sc.parts.map(p => p.engine);
      E.forEach(e => { e.offline = false; });
      const cost = Voice.cost(E[0].S);
      const live = v => !v.disposed && !v._going;
      const used = () => E.reduce((a, e) => a + e.engineCost() + [...e.voices.values(), ...e.tails].filter(live).reduce((b, v) => b + v.cost, 0), 0);   // like the engine: fixed cost of each part + its voices
      let maxUsed = 0;
      const on = (e, id) => { e.noteOn(id, 220, 0.8); maxUsed = Math.max(maxUsed, used()); };
      for (let i = 0; i < 8; i++) on(E[0], 'a' + i);                        // part 1: holds 8
      const held0 = [...E[0].voices.values()];
      for (let i = 0; i < 10; i++) on(E[1], 'b' + i);                       // part 2: plays 10…
      for (let i = 0; i < 10; i++) E[1].noteOff('b' + i);                   // …and releases them: 10 tails
      const tails1 = [...E[1].tails];
      const nRoom = Math.floor((VOICE_BUDGET - used()) / cost + 1e-9);      // what fits without touching anything
      for (let i = 0; i < nRoom + 3; i++) on(E[2], 'c' + i);                // part 3: three too many → 3 tails go
      const gone1 = tails1.filter(v => v._going).length;
      if (gone1 !== 3) problems.push('going 3 voices over drops ' + gone1 + ' tails (expected 3)');
      if (!tails1.slice(0, gone1).every(v => v._going)) problems.push('the oldest tails did not go first');
      if (held0.some(v => v._going || v.disposed) || E[0].voices.size !== 8) problems.push('tails: a held note of another part was touched');
      for (const e of E) { e.offline = true; e.allNotesOff(); }
      // no tails to fade: it steals from the part that ASKS for the note, never from another
      const ctxB = new OfflineAudioContext(2, SR, SR);
      const costly = { waveA: 'fm4', waveB: 'fm4', levelA: 0.5, levelB: 0.5, vocAmt: 0.6 };
      const scB = await createScene(ctxB, [st, st, costly, st]), EB = scB.parts.map(p => p.engine);
      EB.forEach(e => { e.offline = false; });
      const usedB = () => EB.reduce((a, e) => a + e.engineCost() + [...e.voices.values(), ...e.tails].filter(live).reduce((b, v) => b + v.cost, 0), 0);
      for (let i = 0; i < 8; i++) EB[0].noteOn('a' + i, 220, 0.8);
      const heldB = [...EB[0].voices.values()];
      for (let i = 0; i < 10; i++) { EB[2].noteOn('c' + i, 220, 0.8); maxUsed = Math.max(maxUsed, usedB()); }
      const stolen3 = [...EB[2].tails].filter(v => v._going).length;
      if (!(stolen3 > 0)) problems.push('without tails, the asking part did not give up its oldest voice (cost ' + Voice.cost(EB[2].S).toFixed(2) + ')');
      if (heldB.some(v => v._going || v.disposed) || EB[0].voices.size !== 8) problems.push('without tails: a held note of ANOTHER part was stolen');
      if (maxUsed > VOICE_BUDGET + 1e-9) problems.push('usage reached ' + maxUsed.toFixed(2) + ' > ' + VOICE_BUDGET);
      for (const e of EB) { e.offline = true; e.allNotesOff(); }
      // offline: no cap
      const ctx2 = new OfflineAudioContext(2, SR, SR), e2 = new AudioEngine(); e2.S = structuredClone(E[0].S); await e2.init(ctx2);
      const n = Math.ceil(VOICE_BUDGET / cost) + 5;
      for (let i = 0; i < Math.min(n, 10); i++) e2.noteOn('o' + i, 220, 0.8);
      for (let i = 0; i < 10; i++) e2.noteOff('o' + i);
      for (let i = 0; i < 10; i++) e2.noteOn('p' + i, 220, 0.8);
      if ([...e2.tails].some(v => v._going)) problems.push('offline also cuts tails');
      console.log('budget: voice ' + cost.toFixed(2) + ' · cap ' + VOICE_BUDGET + ' · max usage ' + maxUsed.toFixed(2) + ' · tails faded ' + tails1.filter(v => v._going).length + '/10 · stolen from the asking part ' + stolen3);
    } catch (e) { problems.push('exception: ' + (e.message || e)); }
    push({ name: 'voice budget shared by the parts (tails first; never another part\'s held note; offline without a cap)', peak: 0, ok: !problems.length, problems });
  }

  {
    // skin (10): the ONLY source of color is the token block of style.css
    // (:root and [data-theme]). Outside it, in the js/ui canvases (which read
    // the tokens through theme.js) and in index.html there can be no hex/rgb/hsl
    // literals, except black/white with alpha (shadow and highlight: relief, not
    // color). That way a new theme is made by redefining tokens and nothing is
    // hard-coded. The files are read over HTTP as the runner serves them; the
    // js files are those main.js imports from ui/ (except theme.js, which serves them).
    body.appendChild(el('st-cat', 'Skin'));
    const problems = [];
    const LIT = /#[0-9a-f]{3,8}\b|\b(?:rgba?|hsla?)\(\s*\d[^)]*\)/gi;   // literal: hex, or rgb()/hsl() starting with a digit
    const shade = s => /^rgba?\(\s*(?:0\s*,\s*0\s*,\s*0|255\s*,\s*255\s*,\s*255)\s*[,/]/.test(s);   // black/white with alpha
    const lineOf = (txt, i) => txt.slice(0, i).split('\n').length;
    const blank = m => m.replace(/[^\n]/g, ' ');                       // blanks text without moving the lines
    const tokenBlock = sel => sel.split(',').every(s => /^\s*(:root|html)?(\[data-theme[^\]]*\])?\s*$/.test(s) && s.trim());
    const found = (label, txt, from, off) => { let h; LIT.lastIndex = 0;
      while ((h = LIT.exec(from))) if (!shade(h[0])) problems.push(label + ':' + lineOf(txt, off + h.index) + ' ' + h[0]); };
    try {
      const get = async f => (await fetch(f + '?t=' + Date.now())).text();
      const css = (await get('css/style.css')).replace(/\/\*[\s\S]*?\*\//g, blank);
      const re = /([^{}]+)\{([^{}]*)\}/g; let m;                        // block = selector { declarations }
      while ((m = re.exec(css))) if (!tokenBlock(m[1].trim())) found('style.css', css, m[2], m.index + m[1].length + 1);
      const main = await get('js/main.js');
      const files = [...main.matchAll(/from '\.\/ui\/(\w+)\.js'/g)].map(x => x[1]).filter(n => n !== 'theme');
      if (!files.length) problems.push('main.js without ui/ imports');
      for (const n of files) {
        const js = (await get('js/ui/' + n + '.js')).replace(/\/\*[\s\S]*?\*\//g, blank).replace(/\/\/[^\n]*/g, blank);
        found(n + '.js', js, js, 0);
      }
      const html = (await get('index.html')).replace(/<!--[\s\S]*?-->/g, blank);
      found('index.html', html, html, 0);
    } catch (e) { problems.push('reading: ' + e.message); }
    push({ name: 'skin: tokens (color only in :root/[data-theme]; canvases through theme.js)', peak: 0, ok: !problems.length, problems: problems.slice(0, 12) });
  }
  {
    // skin (10): the knob does not draw, it PUBLISHES. knobs.js sets --pos (0..1) on the
    // .knob and the CSS rotates the .ind carrier with it (−135° + pos·270°); log
    // knobs publish the position, not the value; amount knobs (act) at 0 get
    // .off and their indicator turns --edge-hi. On real visible knobs; they are restored.
    const problems = [];
    const byCfg = f => [...document.querySelectorAll('.knob[data-knob]')].find(k => k.offsetParent && PARAMS[k.dataset.knob] && CONTROLS[k.dataset.knob] && f(PARAMS[k.dataset.knob]));
    const lin = byCfg(c => !c.log && !c.act), lg = byCfg(c => c.log), act = byCfg(c => c.act);
    const pos = k => +k.style.getPropertyValue('--pos');
    const angle = k => { const m = getComputedStyle(k.querySelector('.ind')).transform.match(/matrix\(([^)]+)\)/); if (!m) return NaN;
      const [a, b] = m[1].split(',').map(Number); return Math.atan2(b, a) * 180 / Math.PI; };
    const near = (x, y, tol) => Math.abs(x - y) <= tol;
    if (!lin || !lg || !act) problems.push('missing sample knobs (visible linear/log/act)');
    else {
      const test = (k, label, v, want) => { CONTROLS[k.dataset.knob].set(v); if (!near(pos(k), want, 1e-3)) problems.push(label + ': --pos ' + pos(k) + ' ≠ ' + want.toFixed(3)); return angle(k); };
      for (const [k, label] of [[lin, 'linear ' + lin.dataset.knob], [lg, 'log ' + lg.dataset.knob]]) {
        const cfg = PARAMS[k.dataset.knob], keep = CONTROLS[k.dataset.knob].get();
        const a0 = test(k, label + ' min', cfg.min, 0), a1 = test(k, label + ' max', cfg.max, 1);
        if (!near(a0, -135, 0.5) || !near(a1, 135, 0.5)) problems.push(label + ': rotation ' + a0.toFixed(1) + '° / ' + a1.toFixed(1) + '° (expected −135 / 135)');
        test(k, label + ' def', cfg.def, cfg.log ? valToPos(cfg, cfg.def) : (cfg.def - cfg.min) / (cfg.max - cfg.min));
        CONTROLS[k.dataset.knob].set(keep);
      }
      const name = act.dataset.knob, keep = CONTROLS[name].get(), edgeHi = getComputedStyle(document.documentElement).getPropertyValue('--edge-hi').trim();
      CONTROLS[name].set(0);
      const ind0 = getComputedStyle(act).getPropertyValue('--knob-ind').trim();
      if (!act.classList.contains('off')) problems.push('act ' + name + ' at 0 without .off');
      if (ind0 !== edgeHi) problems.push('act ' + name + ' at 0: indicator ' + ind0 + ' ≠ ' + edgeHi);
      CONTROLS[name].set(PARAMS[name].max);
      if (act.classList.contains('off')) problems.push('act ' + name + ' at maximum still .off');
      CONTROLS[name].set(keep);
    }
    const sl = document.getElementById('s_a');                        // the slider publishes the same way (sliders.js)
    if (!sl || !CONTROLS.a) problems.push('no sample slider (s_a)');
    else {
      const keep = CONTROLS.a.get(), sp = () => +sl.style.getPropertyValue('--pos');
      CONTROLS.a.set(PARAMS.a.min); if (!near(sp(), 0, 1e-3)) problems.push('slider at min: --pos ' + sp());
      CONTROLS.a.set(PARAMS.a.max); if (!near(sp(), 1, 1e-3)) problems.push('slider at max: --pos ' + sp());
      CONTROLS.a.set(keep);
    }
    push({ name: 'skin: knob and slider publish --pos; the CSS rotates and dims the indicator', peak: 0, ok: !problems.length, problems });
  }
  {
    // skin (10): theme selector. A theme is a `:root[data-theme="id"]` block
    // with --theme-name; the base :root is the default theme (--theme-id).
    // theme.js reads the stylesheets to fill the <select>: adding a theme is adding
    // CSS. A test theme is injected, chosen (via the API and via the <select>),
    // and it checks that the computed token changes and the one theme.js serves to the
    // canvases, that it is remembered and that it notifies (theme-changed); everything is restored.
    const problems = [];
    const html = document.documentElement, before = currentTheme(), sel = document.getElementById('themeSel');
    let savedLS = null; try { savedLS = localStorage.getItem('subsdj.theme.v1'); } catch { /* no persistence */ }
    const st = document.createElement('style');
    st.textContent = ':root[data-theme="st-prueba"]{--theme-name:"Prueba";--accent:rgb(18 52 86);}';
    document.head.appendChild(st);
    try {
      const themes = listThemes(), base = themes.find(t => t.base), test = themes.find(t => t.id === 'st-prueba');
      if (!base || !base.name) problems.push('no base theme (:root with --theme-id / --theme-name)');
      if (!test || test.name !== 'Prueba') problems.push('the injected theme does not show up in listThemes()');
      if (!sel) problems.push('no <select id="themeSel">');
      else if (sel.options.length < themes.length - 1) problems.push('the <select> has ' + sel.options.length + ' options for ' + (themes.length - 1) + ' themes');
      let fired = 0; const onT = e => { if (e.detail.theme === 'st-prueba') fired++; };
      document.addEventListener('theme-changed', onT);
      const accent0 = getComputedStyle(html).getPropertyValue('--accent').trim();
      setTheme('st-prueba');
      const accent1 = getComputedStyle(html).getPropertyValue('--accent').trim();
      if (html.dataset.theme !== 'st-prueba') problems.push('data-theme not set');
      if (accent1 === accent0 || !/18/.test(accent1)) problems.push('computed --accent did not change: ' + accent1);
      if (token('--accent') !== '#123456') problems.push('theme.js serves ' + token('--accent') + ' ≠ #123456 (cache not cleared)');
      if (!fired) problems.push('no theme-changed event');
      if (localStorage.getItem('subsdj.theme.v1') !== 'st-prueba') problems.push('not remembered');
      document.removeEventListener('theme-changed', onT);
      if (sel && base) {                                  // through the user's path: choosing in the <select>
        if (sel.value !== 'st-prueba') problems.push('the <select> does not reflect the theme (' + sel.value + ')');
        sel.value = base.id; sel.dispatchEvent(new Event('change'));
        if (html.dataset.theme) problems.push('choosing the base in the <select> leaves data-theme=' + html.dataset.theme);
        if (getComputedStyle(html).getPropertyValue('--accent').trim() !== accent0) problems.push('the base does not restore --accent');
        if (localStorage.getItem('subsdj.theme.v1') !== base.id) problems.push('the <select> does not remember the base');
      }
      setTheme('no-existe');
      if (html.dataset.theme) problems.push('an unknown id does not fall back to the base');
    } catch (e) { problems.push('error: ' + e.message); }
    st.remove();
    setTheme(before, { remember: false });
    try { if (savedLS === null) localStorage.removeItem('subsdj.theme.v1'); else localStorage.setItem('subsdj.theme.v1', savedLS); } catch { /* no persistence */ }
    push({ name: 'skin: theme selector (stylesheets → <select>, computed and served token, memory, event)', peak: 0, ok: !problems.length, problems });
  }

  {
    // library (13b), with a fake storage (the user's is not touched):
    // factory seeding + migrated v1 user presets; reseeding does not duplicate; deleting from
    // factory and «restoring» puts it back in ITS section; renamed/tweaked does not come
    // back in; sections (create, rename, move with order, reorder,
    // delete); favorites; accent-insensitive search; export → import into another
    // library (exact round trip, repeating does not duplicate); loose v2 bank and
    // scene; persistence; and the repo files by fetch (twice).
    body.appendChild(el('st-cat', 'Library'));
    const problems = [];
    const mkStore = () => { const m = {}; return { getItem: k => (k in m ? m[k] : null), setItem: (k, v) => { m[k] = String(v); }, removeItem: k => { delete m[k]; } }; };
    const store = mkStore();
    const L = new Library({ key: 'subsdj.biblioteca.selftest', storage: store });
    const isNew = L.load({ user: { 'Mío 1': { cutoff: 0.5, reso: 3 } } });
    const nFactory = Object.values(FACTORY).reduce((a, c) => a + Object.keys(c).length, 0);
    if (!isNew) problems.push('load did not see it as new');
    if (L.presets().length !== nFactory + 1) problems.push('seeding: ' + L.presets().length + ' ≠ ' + (nFactory + 1));
    if (L.sections().map(s => s.name).join('|') !== Object.keys(FACTORY).join('|') + '|' + SEC_MINE) problems.push('sections: ' + L.sections().map(s => s.name).join('|'));
    const mine = L.presets().find(p => p.name === 'Mío 1');
    if (!mine || !(mine.data.cutoff > 1) || mine.data.reso !== 3) problems.push('v1 user preset not migrated');
    if (L.seedFactory() !== 0) problems.push('reseeding the factory duplicates');
    if (L.data.bankRev !== BANK_REV) problems.push('bankRev not stored');
    // factory metadata travels with the item (tags, play, the seed key with the revision, the seeding fingerprint)
    const bs = L.presets().find(p => p.name === 'Berlin Sequence');
    if (!bs || !bs.play || !(bs.tags || []).includes('berlin') || !bs.seedFp || bs.seedSec !== 'Motion' || bs.seed !== 'factory:' + BANK_REV + ':Berlin Sequence')
      problems.push('factory metadata or seed: ' + JSON.stringify(bs && { seed: bs.seed, tags: bs.tags, play: !!bs.play, fp: bs.seedFp, sec: bs.seedSec }));
    if (!L.search('berlin').some(i => i.name === 'Berlin Sequence')) problems.push('search by tag');
    const acid = L.presets().find(p => p.name === 'Acid Line'), secAcid = acid && acid.section;
    L.remove(acid.id);
    if (L.presets().some(p => p.name === 'Acid Line')) problems.push('delete does not delete');
    if (L.seedFactory() !== 1) problems.push('restore factory does not put back exactly 1');
    const acid2 = L.presets().find(p => p.name === 'Acid Line');
    if (!acid2 || acid2.section !== secAcid) problems.push('restored outside its section');
    L.rename(acid2.id, 'Ácido mío'); L.update(mine.id, { cutoff: 999 });
    if (L.seedFactory() !== 0) problems.push('renamed or tweaked gets duplicated on restore');
    const sT = L.createSection('Prueba'); L.renameSection(sT, 'Prueba 2');
    if (!L.section(sT) || L.section(sT).name !== 'Prueba 2') problems.push('rename section');
    const [a, b, c] = L.presets().slice(0, 3);
    L.move(a.id, sT); L.move(b.id, sT); L.move(c.id, sT, a.id);          // c before a → c, a, b
    if (L.items(sT).map(i => i.id).join() !== [c.id, a.id, b.id].join()) problems.push('move/order: ' + L.items(sT).map(i => i.name).join(','));
    L.moveSection(sT, -1);
    const secs = L.sections(); if (secs[secs.length - 2].id !== sT) problems.push('reorder section');
    L.fav(a.id); if (L.favorites().length !== 1 || !L.item(a.id).fav) problems.push('favorite');
    L.fav(a.id); if (L.favorites().length !== 0) problems.push('remove favorite');
    if (!L.search('acido').some(i => i.id === acid2.id) || L.search('ACIDO MIO').length !== 1) problems.push('accent-insensitive search');
    const fingerprint = X => X.sections().map(s => s.name + ':' + X.items(s.id).map(i => i.name + (i.fav ? '*' : '') + '/' + i.type).join(',')).join('|');
    const json = JSON.parse(JSON.stringify(L.exportData()));
    const M = new Library({ key: 'x', storage: mkStore() }); M.load({ seed: false });
    const r1 = M.importData(json), r2 = M.importData(json);
    if (r1.type !== 'library' || r1.n !== L.items().length || r2.n !== 0) problems.push('import round trip: ' + r1.n + '/' + L.items().length + ', repeated ' + r2.n);
    if (fingerprint(M) !== fingerprint(L)) problems.push('content after importing');
    const rb = M.importData({ formato: 'subsdj-presets-v2', presets: { 'Nuevo': { cutoff: 500 }, 'Mío 1': { cutoff: 999 } } });   // «Mío 1» is already there, identical
    if (rb.type !== 'bank' || rb.n !== 1 || !M.sectionByName(SEC_IMPORT)) problems.push('import v2 bank: ' + rb.n);
    const re = M.importData({ formato: 'subsdj-escena-v1', nombre: 'Esc', partes: [] });
    const mScenesSec = M.sectionByName(SEC_SCENES);
    if (re.type !== 'scene' || re.n !== 1 || !mScenesSec || M.items(mScenesSec.id)[0].type !== 'scene') problems.push('import scene');
    const sP = M.sectionByName('Prueba 2');
    if (M.deleteSection(sP.id) !== 3 || M.sectionByName('Prueba 2')) problems.push('delete section with content');
    const L2 = new Library({ key: 'subsdj.biblioteca.selftest', storage: store }); L2.load();
    if (fingerprint(L2) !== fingerprint(L)) problems.push('does not persist');
    const f1 = await L.seedRepoFiles(), f2 = await L.seedRepoFiles();
    const lScenesSec = L.sectionByName(SEC_SCENES), scenes = lScenesSec ? L.items(lScenesSec.id) : [];
    if (f1.n !== REPO_SCENES.length || f2.n !== 0 || f1.errors.length || scenes.length !== REPO_SCENES.length || scenes.some(i => i.type !== 'scene'))   // the repo scenes (no repo bank since 1.5.0)
      problems.push('files: ' + f1.n + '/' + f2.n + ' errors ' + f1.errors.join(',') + ' scenes ' + scenes.length);
    console.log('library: factory ' + nFactory + ' · repo ' + f1.n + ' · sections ' + L.sections().length + ' · items ' + L.items().length);
    push({ name: 'library (seeding · delete/restore · sections · move · ★ · search · export/import · files)', peak: 0, ok: !problems.length, problems });
  }
  {
    // The factory bank (docs/BANK.md): metadata (unique short names, a play line, tags from the
    // vocabulary, a valid use, keys the registry knows, the Ring and cutLFO rules) and COVERAGE:
    // every feature of the synth — waves, filters, LFO shapes, matrix sources and destinations… —
    // shown by at least one preset (tools/bank-report.mjs prints the table).
    body.appendChild(el('st-cat', 'Factory bank'));
    const problems = validateBank(k => k in CONTROLS);
    const cov = coverage();
    if (cov.holes.length) problems.push('features no preset shows: ' + cov.holes.join(', '));
    const n = Object.keys(META).length;
    console.log('bank: rev ' + BANK_REV + ' · ' + n + ' presets in ' + BANK.length + ' categories · coverage ' + (cov.features.length - cov.holes.length) + '/' + cov.features.length);
    push({ name: 'factory bank: metadata of ' + n + ' presets and coverage of ' + cov.features.length + ' features', peak: 0, ok: !problems.length, problems: problems.slice(0, 6) });
  }
  {
    // Bank revision sync (1.5.0, docs/BANK.md): a library seeded by 1.4 (no bankRev, items without
    // seedFp) loads under the new bank: the untouched, unstarred factory / repo-bank / scene copies go,
    // the renamed, moved, edited or ★ ones stay, the empty old sections go (a user's empty one stays),
    // the new bank comes in with its categories first (an old copy identical to a new preset is not
    // duplicated), the scenes are re-seeded (files = false); loading again changes nothing.
    body.appendChild(el('st-cat', 'Bank sync'));
    const problems = [];
    try {
      const mkStore = () => { const m = {}; return { getItem: k => (k in m ? m[k] : null), setItem: (k, v) => { m[k] = String(v); }, removeItem: k => { delete m[k]; } }; };
      const store = mkStore(), fp = d => fnv(canon(d));
      const oldWarm = FX.warmPad, oldPluck = FX.pluckBass, oldKick = FX.kick808;   // 1.4 data: their fingerprints are in LEGACY_FP
      for (const [k, d] of [['factory:Warm Pad', oldWarm], ['factory:Pluck Bass', oldPluck], ['factory:808 Kick', oldKick]])
        if (!LEGACY_FP[k] || LEGACY_FP[k][1] !== fp(d)) problems.push('LEGACY_FP does not match the 1.4 data of ' + k + ' (canon/fnv changed?)');
      const dawn = { format: 'subsdj-scene-v2', name: 'Dawn', parts: [] };   // a scene seeded the 1.5.0 way: its fingerprint stored with it
      const lib = { format: 'subsdj-library-v2', next: 20, files: true,
        sections: [{ id: 's1', name: 'Pads' }, { id: 's2', name: 'Bass' }, { id: 's3', name: 'Presets 2.0' }, { id: 's4', name: '★ Mine' }, { id: 's5', name: 'Scenes' }, { id: 's6', name: 'My empty one' }, { id: 's7', name: 'Keys' }],
        items: [
          { id: 'p1', type: 'preset', name: 'Warm Pad', section: 's1', fav: false, origin: 'factory', seed: 'factory:Warm Pad', data: { ...oldWarm } },       // untouched → goes
          { id: 'p2', type: 'preset', name: 'Warm Pad', section: 's4', fav: false, origin: 'factory', seed: 'factory:Warm Pad', data: { ...oldWarm } },       // moved → stays
          { id: 'p3', type: 'preset', name: 'Pluck Bass', section: 's2', fav: true, origin: 'factory', seed: 'factory:Pluck Bass', data: { ...oldPluck } },   // ★ → stays
          { id: 'p4', type: 'preset', name: 'My bass', section: 's2', fav: false, origin: 'factory', seed: 'factory:Pluck Bass', data: { ...oldPluck } },     // renamed → stays
          { id: 'p5', type: 'preset', name: 'Pluck Bass', section: 's2', fav: false, origin: 'factory', seed: 'factory:Pluck Bass', data: { ...oldPluck, dist: 0.9 } },   // edited → stays
          { id: 'p6', type: 'preset', name: 'Rhodes', section: 's7', fav: true, origin: 'factory', seed: 'factory:Rhodes', data: { ...META['Rhodes'].data } },   // ★ and identical to a new preset → stays, the new one is not duplicated
          { id: 'p7', type: 'preset', name: 'Mine', section: 's4', fav: false, origin: 'user', seed: null, data: { cutoff: 500 } },                           // user → stays
          { id: 'e8', type: 'scene', name: 'Dawn', section: 's5', fav: false, origin: 'scene', seed: 'scene:1:Dawn', seedFp: fp(dawn), seedSec: 'Scenes', data: dawn } ] };   // untouched repo scene → goes
      store.setItem('subsdj.library.sync', JSON.stringify(lib));
      const L = new Library({ key: 'subsdj.library.sync', storage: store });
      const wasNew = L.load();
      const it = id => L.item(id), count = n => L.items().filter(i => i.name === n).length;
      if (wasNew) problems.push('treated as new');
      if (L.data.bankRev !== BANK_REV) problems.push('bankRev not set');
      if (it('p1')) problems.push('untouched factory copy kept');
      if (!it('p2') || L.section(it('p2').section).name !== '★ Mine') problems.push('moved copy lost');
      if (!it('p3') || !it('p3').fav) problems.push('★ copy lost');
      if (!it('p4') || it('p4').name !== 'My bass') problems.push('renamed copy lost');
      if (!it('p5') || it('p5').data.dist !== 0.9) problems.push('edited copy lost');
      if (!it('p6') || count('Rhodes') !== 1) problems.push('★ copy identical to the new preset: kept ' + !!it('p6') + ', ×' + count('Rhodes'));
      if (!it('p7')) problems.push('user preset lost');
      if (it('e8')) problems.push('untouched repo scene kept');
      if (L.sectionByName('Presets 2.0')) problems.push('empty «Presets 2.0» section kept');
      if (!L.sectionByName('My empty one')) problems.push('the user\'s empty section went');
      if (L.data.files !== false) problems.push('files not reset (the scenes would not re-seed)');
      const secs = L.sections().map(s => s.name), want = BANK.map(c => c.cat);
      if (secs.slice(0, want.length).join('|') !== want.join('|')) problems.push('bank categories not first and in order: ' + secs.join('|'));
      const missing = Object.keys(META).filter(n => !count(n));
      if (missing.length) problems.push('new bank not fully in: ' + missing.slice(0, 5).join(', '));
      if (count('Warm Pad') !== 2) problems.push('Warm Pad: expected the moved old one + the new one, got ' + count('Warm Pad'));
      if (count('Pluck Bass') !== 2) problems.push('Pluck Bass: expected ★ + edited, got ' + count('Pluck Bass'));
      const before = JSON.stringify(L.data);
      const L2 = new Library({ key: 'subsdj.library.sync', storage: store }); L2.load();
      if (JSON.stringify(L2.data) !== before) problems.push('a second load changes the library');
      console.log('bank sync: ' + lib.items.length + ' old items → ' + L.items().length + ' (' + L.sections().length + ' sections)');
    } catch (e2) { problems.push('exception: ' + ((e2 && e2.message) || e2)); }
    push({ name: 'bank sync: a 1.4 library follows the new bank, keeping what the user touched or starred', peak: 0, ok: !problems.length, problems });
  }
  {
    // The 1.4 bank archive (subsdj-bank-1.4.json): a library file with the whole old bank —
    // factory, «Presets 2.0» and the four scenes with their presets inlined — importable
    // (File ▾ → Import) into a library that already has the new bank; twice, without duplicates.
    body.appendChild(el('st-cat', 'Bank archive'));
    const problems = [];
    try {
      const j = await (await fetch('subsdj-bank-1.4.json', { cache: 'no-store' })).json();
      const m = {}, store = { getItem: k => (k in m ? m[k] : null), setItem: (k, v) => { m[k] = String(v); }, removeItem: k => { delete m[k]; } };
      const L = new Library({ key: 'subsdj.library.archive', storage: store }); L.load();
      // an archived preset identical (name and content) to one of the new bank is not duplicated
      const same = j.items.filter(it => META[it.name] && canon(META[it.name].data) === canon(it.data)).length;
      const n0 = L.items().length, r1 = L.importData(j), r2 = L.importData(j);
      if (r1.type !== 'library' || r1.n !== j.items.length - same || r2.n !== 0) problems.push('import: ' + r1.n + '/' + (j.items.length - same) + ' (' + same + ' identical to the new bank), repeated ' + r2.n);
      if (L.items().length !== n0 + j.items.length - same) problems.push('count after import');
      if (!(j.items.length >= 160) || j.sections.some(s => !s.name.startsWith('1.4 · '))) problems.push('archive content: ' + j.items.length + ' items, sections ' + j.sections.map(s => s.name).join(','));
      const sc = L.items().filter(i => i.type === 'scene' && i.origin === 'archive');
      if (sc.length !== 4 || !sc.every(s => s.data.parts.every(p => p.state))) problems.push('archived scenes: ' + sc.length + ', presets inlined: ' + sc.every(s => s.data.parts.every(p => p.state)));
    } catch (e2) { problems.push('exception: ' + ((e2 && e2.message) || e2)); }
    push({ name: 'bank archive: subsdj-bank-1.4.json imports whole (164 items), twice without duplicates', peak: 0, ok: !problems.length, problems });
  }
  {
    // 1.3.0 compatibility (1.4.0, everything in English): what was saved up to 1.3.0 had
    // keys, values and names in Spanish and is translated ON LOAD (engine/legacy.js).
    // (1) a preset with old values = its English equivalent, over the base; (2) an
    // applied v1 scene = the same scene written in v2 (identical JSON); (3) a v1
    // library under its old key: v2 format, factory sections and names translated, the
    // seed translated (restoring the factory does not duplicate it), favorite and user data
    // kept, the A/B demos gone; (4) a MIDI map with a renamed key.
    body.appendChild(el('st-cat', 'Compatibility'));
    const NAME = '1.3.0 compatibility (preset · scene · library · MIDI map in Spanish are translated on load)';
    const problems = [];
    try {
      // (1) preset
      const ES = { waveA: 'tabla', waveB: 'cuerda', wtSet: 'formante', reverbType: 'placa', driveChar: 'plegado', envmMode: 'bucle',
        lfoPhase: 'voz', stReset: 'tocar', cutLfoSync: '1 c', dlySync: 'libre', st2Div: '1 c', st3Drift: '2 c', seqNotes: 'dórica', vocVida: 0.4, resBrillo: 0.7 };
      const EN = { waveA: 'wavetable', waveB: 'string', wtSet: 'formant', reverbType: 'plate', driveChar: 'fold', envmMode: 'loop',
        lfoPhase: 'voice', stReset: 'play', cutLfoSync: '1 bar', dlySync: 'free', st2Div: '1 bar', st3Drift: '2 bars', seqNotes: 'dorian', vocLife: 0.4, resBright: 0.7 };
      const canon = v => Array.isArray(v) ? '[' + v.map(canon).join(',') + ']' : v && typeof v === 'object' ? '{' + Object.keys(v).sort().map(k => JSON.stringify(k) + ':' + canon(v[k])).join(',') + '}' : JSON.stringify(v);
      if (canon(withPresetBase(ES)) !== canon(withPresetBase(EN))) problems.push('preset: the Spanish values do not translate to the same as their English version');
      for (const k in EN) if (!(k in PARAMS)) problems.push('preset: «' + k + '» is not a parameter');
      // (2) v1 scene = the same in v2
      const v1 = { formato: 'subsdj-escena-v1', nombre: 'Coro robótico', fecha: '2026-10-01T00:00:00Z',
        sala: { bpm: 66, dlySync: 'libre', reverbType: 'placa', fb: 0.4, master: 1 },
        director: { seed: 3, armonia: { root: 2, scale: 'penta menor', prog: [1, 4], bars: 2, modo: 'funciones' },
          arreglo: { energia: 0.5, vaiven: 0.3, ciclo: 8, apertura: 0.4, sorpresa: 0.1 },
          jugadores: [{ mode: 'pulso', k: 5, n: 12, acento: 0.4, respira: 2, cicloP: 4, umbral: 0.2, deriva: 'cutoff', derivaAmt: 0.2 },
            { mode: 'acorde', notas: 4 }, { mode: 'melodia', densidad: 0.5, silencio: 0.2, gravedad: 0.7, rango: 2 }, { mode: 'raiz', quinta: 1, cada: 2 }] },
        partes: [{ preset: 'Bombo 808', ajustes: { reverbMix: 0 } }, { nombre: 'Mi pad', presetVal: 'f:Pad cálido', estado: { waveA: 'tabla', wtSet: 'formante', reverbType: 'placa', vocVida: 0.3 } }] };
      const v2 = { format: 'subsdj-scene-v2', name: 'Robot Choir', date: '2026-10-01T00:00:00Z',
        room: { bpm: 66, dlySync: 'free', reverbType: 'plate', fb: 0.4, master: 1 },
        conductor: { seed: 3, harmony: { root: 2, scale: 'minor penta', prog: [1, 4], bars: 2, mode: 'functions' },
          arrangement: { energy: 0.5, sway: 0.3, cycle: 8, open: 0.4, surprise: 0.1 },
          players: [{ mode: 'pulse', k: 5, n: 12, accent: 0.4, breathe: 2, breatheCycle: 4, threshold: 0.2, drift: 'cutoff', driftAmt: 0.2 },
            { mode: 'chord', notes: 4 }, { mode: 'melody', density: 0.5, rest: 0.2, gravity: 0.7, range: 2 }, { mode: 'root', fifth: 1, every: 2 }] },
        parts: [{ preset: '808 Kick', settings: { reverbMix: 0 } }, { name: 'Mi pad', presetVal: 'f:Warm Pad', state: { waveA: 'wavetable', wtSet: 'formant', reverbType: 'plate', vocLife: 0.3 } }] };
      const viaScene = async j => { const ctx = new OfflineAudioContext(2, SR, SR), sc = await createScene(ctx, []); applySceneJSON(sc, j); const o = sceneToJSON(sc); delete o.date; return canon(o); };
      const s1 = await viaScene(JSON.parse(JSON.stringify(v1))), s2 = await viaScene(v2);
      if (s1 !== s2) problems.push('scene: the v1 does not end up equal to the v2');
      if (!s1.includes('"808 Kick"') || !s1.includes('"mode":"functions"') || !s1.includes('"threshold":0.2')) problems.push('scene: names, mode or keys not translated');
      // (3) v1 library under its old key
      const m = {}, store = { getItem: k => (k in m ? m[k] : null), setItem: (k, v) => { m[k] = String(v); }, removeItem: k => { delete m[k]; } };
      const lib1 = { formato: 'subsdj-biblioteca-v1', next: 9, ficheros: true,
        secciones: [{ id: 's1', nombre: 'Pads' }, { id: 's2', nombre: 'Demos A/B' }, { id: 's3', nombre: '★ Míos' }, { id: 's4', nombre: 'Escenas' }],
        items: [
          { id: 'p1', tipo: 'preset', nombre: 'Pad cálido', seccion: 's1', fav: true, origen: 'fabrica', semilla: 'fabrica:Pad cálido', datos: { ...FX.warmPad } },
          { id: 'p2', tipo: 'preset', nombre: 'DUB 1 · algo', seccion: 's2', fav: false, origen: 'demos', semilla: 'demos:DUB 1 · algo', datos: { cutoff: 900 } },
          { id: 'p3', tipo: 'preset', nombre: 'Mi pad', seccion: 's3', fav: false, origen: 'usuario', semilla: null, datos: { reverbType: 'placa', vocBrillo: 0.6 } },
          { id: 'p4', tipo: 'preset', nombre: 'Mi bombo', seccion: 's1', fav: false, origen: 'fabrica', semilla: 'fabrica:Bombo 808', datos: { cutoff: 120 } },
          { id: 'e5', tipo: 'escena', nombre: 'Coro robótico', seccion: 's4', fav: false, origen: 'escena', semilla: 'escena:Coro robótico', datos: v1 }] };
      store.setItem('subsdj.biblioteca.v1', JSON.stringify(lib1));
      const L = new Library({ key: 'subsdj.library.compat', storage: store });
      const wasNew = L.load();
      const sec = L.sections().map(s => s.name).join('|'), it = id => L.item(id);
      if (wasNew) problems.push('library: the v1 was treated as new');
      if (L.data.format !== 'subsdj-library-v2' || !store.getItem('subsdj.library.compat') || !store.getItem('subsdj.biblioteca.v1')) problems.push('library: format or storage keys');
      // translated AND synced with the 1.5.0 bank (the bank's categories first, then ★ Mine and Scenes)
      if (sec !== BANK.map(c => c.cat).join('|') + '|★ Mine|Scenes') problems.push('library: sections ' + sec);
      if (!it('p1') || it('p1').name !== 'Warm Pad' || it('p1').seed !== 'factory:Warm Pad' || !it('p1').fav || it('p1').origin !== 'factory') problems.push('library: factory preset not translated');
      if (it('p2')) problems.push('library: the A/B demos are still there');
      if (!it('p3') || it('p3').name !== 'Mi pad' || it('p3').data.reverbType !== 'plate' || it('p3').data.vocBright !== 0.6 || it('p3').origin !== 'user') problems.push('library: user preset');
      if (!it('p4') || it('p4').name !== 'Mi bombo' || it('p4').seed !== 'factory:808 Kick') problems.push('library: renamed by the user');
      if (!it('e5') || it('e5').type !== 'scene' || it('e5').name !== 'Robot Choir' || it('e5').data.format !== 'subsdj-scene-v2') problems.push('library: scene');
      if (L.data.bankRev !== BANK_REV) problems.push('library: not synced with the bank');
      if (L.seedFactory() !== 0) problems.push('library: restoring the factory after the sync adds items');
      const dup = n => L.items().filter(x => x.name === n).length;
      // the ★ old Warm Pad stays next to the new one; the renamed «Mi bombo» stays and the new 808 Kick comes in
      if (dup('Warm Pad') !== 2 || dup('808 Kick') !== 1 || dup('Mi bombo') !== 1) problems.push('library: after the bank sync (Warm Pad ×' + dup('Warm Pad') + ', 808 Kick ×' + dup('808 Kick') + ', Mi bombo ×' + dup('Mi bombo') + ')');
      // (4) MIDI map with an old key
      const prevDev = getDevice(), K = 'subsdj.midimap.v1:compat';
      localStorage.setItem(K, JSON.stringify({ pickup: false, ccs: { 41: { id: 'vocVida', lo: 0, hi: 1 } } }));
      setDevice('compat');
      if (!getMap().ccs[41] || getMap().ccs[41].id !== 'vocLife') problems.push('MIDI map: vocVida does not become vocLife');
      localStorage.removeItem(K); setDevice(prevDev);
    } catch (e2) { problems.push('exception: ' + ((e2 && e2.message) || e2)); }
    push({ name: NAME, peak: 0, ok: !problems.length, problems });
  }

  {
    // modulation matrix: two A/B renders through the real path.
    // B1: env→amp at −1 must clearly ATTENUATE against the base render (the route
    //     really sounds). B2: cutoff modulated to the negative maximum NEVER silences
    //     (it goes through the filter detune, exponential: 0 Hz is unreachable).
    body.appendChild(el('st-cat', 'Matrix'));
    let r;
    try {
      loadState({});
      const rA = await renderState(structuredClone(engine.S));
      loadState({ mx1src: 'env', mx1dst: 'amp', mx1amt: -1 });
      const rB1 = await renderState(structuredClone(engine.S));
      loadState({ mx1src: 'lfoCut', mx1dst: 'cutoff', mx1amt: -1, cutLfoSpd: 3 });
      const rB2 = await renderState(structuredClone(engine.S));
      const problems = [];
      if (rB1.bad || rB2.bad) problems.push('NaN/Inf in renders with the matrix');
      if (!(rB1.peak > SILENCE * 0.2 && rB1.peak < rA.peak * 0.75))
        problems.push('env→amp −1 does not attenuate (base ' + dB(rA.peak) + ' vs ' + dB(rB1.peak) + ')');
      if (!(rB2.peak > SILENCE))
        problems.push('cutoff at −1 silenced the render (impossible by design: ' + dB(rB2.peak) + ')');
      r = { name: 'matrix (env→amp attenuates · cutoff never reaches 0 Hz)', peak: rB2.peak, ok: !problems.length, problems };
    } catch (e) {
      r = { name: 'matrix (env→amp attenuates · cutoff never reaches 0 Hz)', peak: 0, ok: false,
            problems: ['exception: ' + ((e && e.message) || e)] };
    }
    push(r);
  }

  {
    // wavetable: morph 0 (sine frame) and morph 1 (pulse frame) must give
    // CLEARLY different, clean renders. Deterministic: copy 0 of the
    // unison keeps the configured phase and the base state has no randomness.
    body.appendChild(el('st-cat', 'Wavetable'));
    let r;
    try {
      loadState({ waveA: 'wavetable', levelA: 1, levelB: 0, wtPos: 0 });
      const bA = await renderBuf(structuredClone(engine.S));
      loadState({ waveA: 'wavetable', levelA: 1, levelB: 0, wtPos: 1 });
      const bB = await renderBuf(structuredClone(engine.S));
      const aA = analyze(bA), aB = analyze(bB);
      const cA = bA.getChannelData(0), cB = bB.getChannelData(0);
      let d = 0, en = 0;
      for (let i = 0; i < cA.length; i += 16) { const x = cA[i] - cB[i]; d += x * x; en += cA[i] * cA[i]; }
      const diff = Math.sqrt(d / Math.max(1e-12, en));
      const problems = [];
      if (aA.bad || aB.bad) problems.push('NaN/Inf');
      if (aA.peak <= SILENCE || aB.peak <= SILENCE) problems.push('silence (' + dB(aA.peak) + ' / ' + dB(aB.peak) + ')');
      if (aA.peak > 1 || aB.peak > 1) problems.push('clipping');
      if (!(diff > 0.3)) problems.push('morph 0 vs 1 barely differs (diff ' + diff.toFixed(3) + ')');
      r = { name: 'wavetable (morph 0 ≠ 1, clean render)', peak: aB.peak, ok: !problems.length, problems };
    } catch (e2) {
      r = { name: 'wavetable (morph 0 ≠ 1, clean render)', peak: 0, ok: false,
            problems: ['exception: ' + ((e2 && e2.message) || e2)] };
    }
    push(r);
  }

  {
    // clean wavetable (Roadmap 7.0 · 0.3): the «Wavetable» oscillator alone, on a
    // full-band frame (frame 4 of 'analog': saw + square, 512 harmonics), at
    // f0 = k·SR/N: each harmonic lands EXACTLY on a bin that is a multiple of k (no window
    // and no leakage) and everything else is reading error (interpolation, aliasing).
    // Energy outside the harmonics relative to the fundamental: with linear and 4× tables
    // it was −49 dB at C2 and −43 at C4; with Hermite and 8× tables, −76 or less.
    body.appendChild(el('st-cat', 'Clean wavetable'));
    const NAME = 'clean wavetable (energy between harmonics < −65 dB at C2, C4 and C6)';
    let r;
    try {
      const N = 32768, problems = [], floors = [];
      const fft = (re, im) => {
        const n = re.length;
        for (let i = 1, j = 0; i < n; i++) { let b = n >> 1; for (; j & b; b >>= 1) j ^= b; j ^= b; if (i < j) { [re[i], re[j]] = [re[j], re[i]]; [im[i], im[j]] = [im[j], im[i]]; } }
        for (let len = 2; len <= n; len <<= 1) {
          const a = -2 * Math.PI / len, wr = Math.cos(a), wi = Math.sin(a);
          for (let i = 0; i < n; i += len) { let cr = 1, ci = 0;
            for (let q = 0; q < len / 2; q++) { const p = i + q, s = p + len / 2, tr = re[s] * cr - im[s] * ci, ti = re[s] * ci + im[s] * cr;
              re[s] = re[p] - tr; im[s] = im[p] - ti; re[p] += tr; im[p] += ti; const t = cr * wr - ci * wi; ci = cr * wi + ci * wr; cr = t; } }
        }
      };
      for (const [note, k] of [['C2', 49], ['C4', 194], ['C6', 778]]) {
        const ctx = new OfflineAudioContext(1, 4096 + N, SR);
        await loadWorklets(ctx);
        const node = new AudioWorkletNode(ctx, 'pulse-processor', { numberOfInputs: 0, numberOfOutputs: 1, outputChannelCount: [1],
          processorOptions: { type: 'wavetable', octaves: 1, wt: getWtSet('analog') } });
        node.parameters.get('frequency').value = k * SR / N;
        node.parameters.get('wtPos').value = 4 / 7;
        node.connect(ctx.destination);
        const d = (await ctx.startRendering()).getChannelData(0);
        const re = Float64Array.from(d.subarray(4096, 4096 + N)), im = new Float64Array(N);
        fft(re, im);
        const P = b => re[b] * re[b] + im[b] * im[b];
        let inh = 0; for (let b = 1; b <= Math.floor(20000 * N / SR); b++) if (b % k) inh += P(b);
        const floorDb = 10 * Math.log10(inh / P(k) + 1e-30);
        floors.push(note + ' ' + floorDb.toFixed(1) + ' dB');
        if (!(floorDb < -65)) problems.push(note + ': ' + floorDb.toFixed(1) + ' dB between harmonics');
      }
      console.log('clean wavetable: ' + floors.join(' · '));
      r = { name: NAME, peak: 0, ok: !problems.length, problems };
    } catch (e2) {
      r = { name: NAME, peak: 0, ok: false, problems: ['exception: ' + ((e2 && e2.message) || e2)] };
    }
    push(r);
  }

  {
    // Hard sync (Roadmap 7.0 · 3.2), measured at f0 = k·SR/N like the clean wavetable: everything
    // that does not land on a multiple of k is aliasing (or error). (1) Through the engine: A saw with
    // Sync, B silent (level 0: it only keeps time) and the matrix «Pitch A» at +702 ct from
    // Macro 1. With sync the wave repeats at B's rate — energy on its harmonics and the
    // fundamental present —; without sync A sounds at 1.5× and almost everything lands outside. If «Pitch
    // A» also moved the master, the sync would give 1.5× and fail. (2) Bare oscillator at
    // C4: the saw sync is no dirtier than the FREE saw at the same pitch (+1.5 dB
    // of margin) and removes ≥ 15 dB from the uncorrected sync (computed here); the sine with sync,
    // with its slope correction, below −75 dB. (3) Live: the button reaches
    // the sounding notes with the octave ratio (B at −1: 0.5) and the Supersaw dims it.
    body.appendChild(el('st-cat', 'Hard sync'));
    const NAME = 'hard sync (the note is B\'s · Pitch A moves only the slave · aliasing like the free oscillator · clean sine · live)';
    let r;
    try {
      const N = 32768, problems = [], keep = snapshot();
      const fft = (re, im) => {
        const n = re.length;
        for (let i = 1, j = 0; i < n; i++) { let b = n >> 1; for (; j & b; b >>= 1) j ^= b; j ^= b; if (i < j) { [re[i], re[j]] = [re[j], re[i]]; [im[i], im[j]] = [im[j], im[i]]; } }
        for (let len = 2; len <= n; len <<= 1) {
          const a = -2 * Math.PI / len, wr = Math.cos(a), wi = Math.sin(a);
          for (let i = 0; i < n; i += len) { let cr = 1, ci = 0;
            for (let q = 0; q < len / 2; q++) { const p = i + q, s = p + len / 2, tr = re[s] * cr - im[s] * ci, ti = re[s] * ci + im[s] * cr;
              re[s] = re[p] - tr; im[s] = im[p] - ti; re[p] += tr; im[p] += ti; const t = cr * wr - ci * wi; ci = cr * wi + ci * wr; cr = t; } }
        }
      };
      // energy outside the multiples of k and the fundamental, both relative to the harmonics' energy (dB)
      const floor = (d, k) => {
        const re = Float64Array.from(d), im = new Float64Array(N); fft(re, im);
        const P = b => re[b] * re[b] + im[b] * im[b];
        let inh = 0, harm = 0; for (let b = 1; b <= Math.floor(20000 * N / SR); b++) if (b % k) inh += P(b); else harm += P(b);
        return { inh: 10 * Math.log10(inh / harm + 1e-30), fund: 10 * Math.log10(P(k) / harm + 1e-30) };
      };
      const k = 179, fB = k * SR / N, ST = 702;   // C4 (exact bin) · A a fifth above
      // (1) through the engine
      const viaEngine = async sync => {
        loadState({ waveA: 'sawtooth', waveB: 'square', levelA: 1, levelB: 0, detuneA: 0, detuneB: 0, syncA: sync, cutoff: 20000, reso: 0.7,
          a: 0.005, d: 0.05, s: 1, r: 0.05, amplitude: 0.3, master: 0.4, mx1src: 'mac1', mx1dst: 'pitchA', mx1amt: ST / 1200, macro1: 1 });
        const ctx = new OfflineAudioContext(2, 8192 + N, SR);
        const eng = new AudioEngine(); eng.S = structuredClone(engine.S); await eng.init(ctx); eng.noteOn('s', fB);
        return floor((await ctx.startRendering()).getChannelData(0).subarray(8192, 8192 + N), k);
      };
      const mOn = await viaEngine('on'), mOff = await viaEngine('off');
      if (!(mOn.inh < -35)) problems.push('with sync the wave does not repeat at B\'s rate (outside its harmonics ' + mOn.inh.toFixed(1) + ' dB)');
      if (!(mOn.fund > -10)) problems.push('with sync B\'s fundamental is missing (' + mOn.fund.toFixed(1) + ' dB)');
      if (!(mOff.inh > -10)) problems.push('without sync A should sound at 1.5× (outside B\'s harmonics ' + mOff.inh.toFixed(1) + ' dB)');
      // (2) the bare oscillator: sync against the free wave at its pitch and against the uncorrected sync
      const osc = async (type, f, sync, slave) => {
        const ctx = new OfflineAudioContext(1, 4096 + N, SR);
        await loadWorklets(ctx);
        const node = new AudioWorkletNode(ctx, 'pulse-processor', { numberOfInputs: 0, numberOfOutputs: 1, outputChannelCount: [1], processorOptions: { type, octaves: 1 } });
        node.parameters.get('frequency').value = f;
        node.parameters.get('syncRatio').value = sync; node.parameters.get('slave').value = slave;
        node.connect(ctx.destination);
        return (await ctx.startRendering()).getChannelData(0).subarray(4096, 4096 + N);
      };
      const naive = ratio => {   // naive saw sync: the uncorrected step
        const d = new Float64Array(N); let p = 0, g = 0; const dt = fB * ratio / SR, dtm = fB / SR;
        for (let i = 0; i < 4096 + N; i++) {
          if (i >= 4096) d[i - 4096] = 2 * p - 1;
          p += dt; if (p >= 1) p -= 1;
          g += dtm; if (g >= 1) { g -= 1; p = g / dtm * dt; }
        }
        return d;
      };
      const kFree = 268;   // the free saw at 1.5× C4 (exact bin closest to the fifth)
      const sSync = floor(await osc('sawtooth', fB, 1, ST), k).inh, sFree = floor(await osc('sawtooth', kFree * SR / N, 0, 0), kFree).inh;
      const sNaive = floor(naive(Math.pow(2, ST / 1200)), k).inh;
      const sSine = floor(await osc('sine', fB, 1, ST), k).inh;
      if (!(sSync <= sFree + 1.5)) problems.push('saw with sync ' + sSync.toFixed(1) + ' dB outside the harmonics, dirtier than the free one (' + sFree.toFixed(1) + ')');
      if (!(sSync <= sNaive - 15)) problems.push('the reset correction removes too little: ' + sSync.toFixed(1) + ' against ' + sNaive.toFixed(1) + ' dB naive');
      if (!(sSine < -75)) problems.push('sine with sync ' + sSine.toFixed(1) + ' dB outside the harmonics (expected < −75)');
      // (3) live: the button reaches the sounding notes; dimmed with the Supersaw
      loadState({ waveA: 'sawtooth', octB: -1, detuneA: 0, detuneB: 0, syncA: 'off' });
      engine.noteOn('syncLive', 220);
      const v = engine.voices.get('syncLive'), a = v && v.oscs[0];
      const r0 = a && a.syncR ? a.syncR.value : NaN;
      CONTROLS.syncA.set('on');
      const r1 = a && a.syncR ? a.syncR.value : NaN;
      engine.allNotesOff();
      if (!(r0 === 0 && Math.abs(r1 - 0.5) < 1e-6)) problems.push('live: ratio ' + r0 + ' → ' + r1 + ' (expected 0 → 0.5: B one octave down)');
      loadState({ waveA: 'supersaw', syncA: 'on' });
      await new Promise(res => setTimeout(res, 50));
      const btn = document.getElementById('syncA');
      if (!btn || !btn.classList.contains('dep-off')) problems.push('with the Supersaw the Sync button does not show as dimmed');
      // with Sync B is in charge even when silent: its module stays live, except the wave and the stack
      loadState({ waveA: 'sawtooth', levelB: 0, syncA: 'on' });
      await new Promise(res => setTimeout(res, 50));
      const h2B = [...document.querySelectorAll('.panel h2')].find(h => [...h.childNodes].filter(n => n.nodeType === 3).map(n => n.textContent).join('').trim() === 'Osc B');
      const panelB = h2B && h2B.closest('.panel'), waveB = document.getElementById('waveB');
      if (!panelB || panelB.classList.contains('dep-off') || !waveB || !waveB.closest('.dep-off')) problems.push('with Sync and B at level 0, Osc B should stay live (except wave and stack)');
      loadState(keep);
      console.log('sync: engine outside harmonics with/without ' + mOn.inh.toFixed(1) + '/' + mOff.inh.toFixed(1) + ' dB (fund ' + mOn.fund.toFixed(1) + ') · saw C4 +702 sync ' + sSync.toFixed(1) + ' · free at 1.5× ' + sFree.toFixed(1) + ' · naive ' + sNaive.toFixed(1) + ' · sine sync ' + sSine.toFixed(1) + ' dB · live ' + r0 + ' → ' + r1);
      r = { name: NAME, peak: 0, ok: !problems.length, problems };
    } catch (e2) { r = { name: NAME, peak: 0, ok: false, problems: ['exception: ' + ((e2 && e2.message) || e2)] }; }
    push(r);
  }

  {
    // String (Roadmap 7.0 · 3.3: extended Karplus-Strong), through the engine (the whole voice,
    // with the filter open): (1) tuning: the peak of the fundamental (DFT with Hann,
    // fine sweep) within ±2 cents of the note from C2 to C6, with and without Stiffness — the fractional
    // all-pass and the loop's phase delays, compensated IN the note; (2) it dies away
    // like a string: at C3 the fundamental loses what its T60 dictates (Decay 3 s at C4,
    // ×√2 an octave down: 18.4 dB in 1.3 s, ±2) and the 5th harmonic loses more; with Decay
    // 20 s the ratio holds (Bright is relative); (3) velocity is the
    // pick strength: at 0.3 the attack highs are ≥ 6 dB lower than at 1;
    // (4) Stiffness stretches the harmonics: at 1, the 10th rises more than a semitone.
    body.appendChild(el('st-cat', 'String'));
    const NAME = 'string (tuning ±2 ct C2-C6 · the fundamental lasts longer than the 5th · Decay without changing the color · velocity = brightness · stiffness stretches)';
    let r;
    try {
      const problems = [], keep = snapshot(), log = [];
      const render = async (st, f, vel = 1, secs = 2) => {
        loadState({ waveA: 'string', levelA: 0.8, levelB: 0, cutoff: 20000, reso: 0.7, a: 0, d: 0.05, s: 1, r: 0.05, amplitude: 0.3, master: 0.4, ...st });
        const ctx = new OfflineAudioContext(2, Math.ceil(SR * secs), SR);
        const eng = new AudioEngine(); eng.S = structuredClone(engine.S); await eng.init(ctx); eng.noteOn('c', f, vel);
        return (await ctx.startRendering()).getChannelData(0);
      };
      const hann = new Map();   // windows by size (reused)
      const mag = (d, f, i0, n) => {   // DFT with a Hann window at frequency f (the phasor rotates by multiplication: no per-sample trigonometry)
        let wv = hann.get(n); if (!wv) { wv = new Float32Array(n); for (let i = 0; i < n; i++) wv[i] = 0.5 - 0.5 * Math.cos(2 * Math.PI * i / (n - 1)); hann.set(n, wv); }
        const w = 2 * Math.PI * f / SR, cr = Math.cos(w), ci = Math.sin(w);
        let re = 0, im = 0, pr = 1, pi = 0;
        for (let i = 0; i < n; i++) { const x = d[i0 + i] * wv[i]; re += x * pr; im -= x * pi; const t = pr * cr - pi * ci; pi = pr * ci + pi * cr; pr = t; }
        return Math.hypot(re, im);
      };
      const peakCents = (d, f, i0, n, span = 30) => {   // cents of the peak near f
        let best = -1, bc = 0;
        for (let c = -span; c <= span; c += 4) { const m = mag(d, f * Math.pow(2, c / 1200), i0, n); if (m > best) { best = m; bc = c; } }
        for (let c = bc - 4, c1 = bc + 4; c <= c1; c += 0.5) { const m = mag(d, f * Math.pow(2, c / 1200), i0, n); if (m > best) { best = m; bc = c; } }
        for (let c = bc - 0.5, c1 = bc + 0.5; c <= c1; c += 0.05) { const m = mag(d, f * Math.pow(2, c / 1200), i0, n); if (m > best) { best = m; bc = c; } }
        return bc;
      };
      // (1) tuning
      for (const stiff of [0, 1]) {
        const row = [];
        for (const [n, f] of [['C2', 65.406], ['C4', 261.63], ['C6', 1046.5]]) {
          const d = await render({ strStiff: stiff }, f, 1, 1.6);
          const c = peakCents(d, f, Math.round(0.1 * SR), 65536);
          row.push(n + ' ' + c.toFixed(2));
          if (!(Math.abs(c) <= 2)) problems.push('stiffness ' + stiff + ', ' + n + ': ' + c.toFixed(2) + ' cents');
        }
        log.push('stiffness ' + stiff + ' ' + row.join(' '));
      }
      // (2) how it dies away (C3)
      const f3 = 130.81, W = Math.round(0.3 * SR), t0 = Math.round(0.1 * SR), t1 = Math.round(1.4 * SR);
      const drop = (d, h) => 20 * Math.log10(mag(d, h * f3, t0, W) / mag(d, h * f3, t1, W));
      const dN = await render({}, f3), dL = await render({ strDecay: 20 }, f3);
      const h1 = drop(dN, 1), h5 = drop(dN, 5), h1L = drop(dL, 1), h5L = drop(dL, 5);
      if (!(Math.abs(h1 - 18.4) < 2)) problems.push('the fundamental drops ' + h1.toFixed(1) + ' dB in 1.3 s (expected 18.4: Decay 3 s at C4, ×√2 at C3)');
      if (!(h5 > h1 + 10)) problems.push('the 5th harmonic does not die away sooner (' + h5.toFixed(1) + ' against ' + h1.toFixed(1) + ' dB)');
      const prop = (h5 / h1), propL = (h5L / h1L);
      if (!(Math.abs(propL / prop - 1) < 0.2)) problems.push('with Decay 20 s the color changes: 5th/1st ' + propL.toFixed(2) + ' against ' + prop.toFixed(2));
      // (3) velocity = pick strength (attack highs, h6-30 against h1-3, first 50 ms)
      const highs = async vel => { const d = await render({}, f3, vel, 0.3); let lo = 0, hi = 0;
        for (let h = 1; h <= 3; h++) lo += mag(d, h * f3, 0, 2400) ** 2; for (let h = 6; h <= 30; h++) hi += mag(d, h * f3, 0, 2400) ** 2; return 10 * Math.log10(hi / lo); };
      const v03 = await highs(0.3), v1 = await highs(1);
      if (!(v1 - v03 >= 6)) problems.push('velocity barely changes the brightness: ' + v03.toFixed(1) + ' / ' + v1.toFixed(1) + ' dB');
      // (4) stiffness: the 10th harmonic
      const dS = await render({ strStiff: 1, strBright: 1 }, f3, 1, 1.2);
      const h10 = peakCents(dS, 10 * f3, Math.round(0.05 * SR), 32768, 300);
      if (!(h10 > 100)) problems.push('with Stiffness 1 the 10th harmonic rises only ' + h10.toFixed(1) + ' cents');
      loadState(keep);
      console.log('string: tuning ' + log.join(' · ') + ' ct · C3 in 1.3 s h1 ' + h1.toFixed(1) + ' dB h5 ' + h5.toFixed(1) + ' · Decay 20 s h1 ' + h1L.toFixed(1) + ' h5 ' + h5L.toFixed(1) + ' · highs vel 0.3/1 ' + v03.toFixed(1) + '/' + v1.toFixed(1) + ' dB · stiffness 1: h10 +' + h10.toFixed(0) + ' ct');
      r = { name: NAME, peak: 0, ok: !problems.length, problems };
    } catch (e2) { r = { name: NAME, peak: 0, ok: false, problems: ['exception: ' + ((e2 && e2.message) || e2)] }; }
    push(r);
  }

  // Render of one note at f0 = SR/336 (131.25 Hz: one period = 336 samples) and its
  // EXACT spectrum over a window of 60 periods (from 0.4 s on): each
  // harmonic lands on its bin and the window mean is the true DC.
  const F336 = SR / 336, WIN336 = 336 * 60;
  const renderF336 = async (state, vel = 1, mult = 1) => {
    const ctx = new OfflineAudioContext(2, Math.ceil(SR * 1.2), SR);
    const eng = new AudioEngine(); eng.S = structuredClone(state);
    await eng.init(ctx);
    eng.noteOn('t', F336 * mult, vel);
    ctx.suspend(1.0).then(() => { eng.noteOff('t'); ctx.resume(); });
    return (await ctx.startRendering()).getChannelData(0).slice(Math.round(0.4 * SR), Math.round(0.4 * SR) + WIN336);
  };
  const harm336 = (d, k) => { let re = 0, im = 0; for (let i = 0; i < d.length; i++) { const a = 2 * Math.PI * k * 60 * i / d.length; re += d[i] * Math.cos(a); im += d[i] * Math.sin(a); } return 2 * Math.hypot(re, im) / d.length; };
  const mean336 = d => d.reduce((a, x) => a + x, 0) / d.length;
  const centroid336 = d => { let w = 0, s = 0; for (let k = 1; k <= 30; k++) { const a = harm336(d, k); w += a * a * k; s += a * a; } return w / Math.max(1e-30, s); };

  {
    // Character drive (Roadmap 7.0 · 3.1): (1) soft + Asymmetry gives EVEN
    // harmonics (2nd > −30 dB below the 1st) with no DC (< −80 dB: the 5 Hz blocker) and
    // without Asymmetry there are no even ones; (2) in silence, exact silence (the bias is
    // compensated: f(g·x + b) − f(b)); (3) fold with the Drive swept by the matrix
    // (velocity → Drive, at Drive 1 = fully saturated): the brightness RISES overall but
    // not monotonically — harmonics appear and drop again; the
    // soft one, in contrast, only rises; (4) fold with full symmetry: only even ones (the
    // fundamental falls more than 30 dB below the 2nd).
    body.appendChild(el('st-cat', 'Character drive'));
    const NAME = 'character drive (asymmetry = even harmonics without DC · exact silence · non-monotonic fold · symmetry = octave)';
    let r;
    try {
      const problems = [], base = { waveA: 'sine', levelA: 0.6, levelB: 0, cutoff: 20000, reso: 0, a: 0.005, d: 0.05, s: 1, r: 0.05, width: 0 };
      const st = o => { loadState({ ...base, ...o }); return structuredClone(engine.S); };
      const asym = await renderF336(st({ filterDrive: 0.5, driveAsym: 1 })), sym = await renderF336(st({ filterDrive: 0.5 }));
      const h2a = harm336(asym, 2) / harm336(asym, 1), dca = Math.abs(mean336(asym)) / harm336(asym, 1), h2s = harm336(sym, 2) / harm336(sym, 1);
      if (!(h2a > 0.0316)) problems.push('asymmetric: 2nd harmonic ' + dB(h2a) + ' (expected > −30 dB)');
      if (!(dca < 1e-4)) problems.push('asymmetric: DC ' + dB(dca) + ' (expected < −80 dB)');
      if (!(h2s < 1e-3)) problems.push('symmetric with even harmonics: ' + dB(h2s));
      // (2) silence: no source (levels at 0) and full bias, in both characters
      let sil = 0;
      for (const driveChar of ['soft', 'fold']) { const d = await renderF336(st({ levelA: 0, filterDrive: 1, driveAsym: 1, driveChar })); for (const x of d) sil = Math.max(sil, Math.abs(x)); }
      if (!(sil < 1e-6)) problems.push('silence with bias: peak ' + dB(sil));
      // (3) brightness against the input gain: vel 1 → gain 1 … vel 0.1 → 9.1
      const sweep = async driveChar => { const S = st({ filterDrive: 1, driveChar, mx1src: 'vel', mx1dst: 'drive', mx1amt: -1 }), c = [];
        for (let v = 10; v >= 1; v--) c.push(centroid336(await renderF336(S, v / 10))); return c; };
      const cF = await sweep('fold'), cS = await sweep('soft');
      const drops = cF.filter((x, i) => i > 0 && x < cF[i - 1] - 0.05).length, sDrops = cS.filter((x, i) => i > 0 && x < cS[i - 1] - 0.05).length;
      if (!(cF[cF.length - 1] > 2 * cF[0])) problems.push('fold: the brightness does not rise with the Drive (' + cF[0].toFixed(2) + ' → ' + cF[cF.length - 1].toFixed(2) + ')');
      if (!(drops >= 1)) problems.push('fold: the brightness rises monotonically (no folds)');
      if (sDrops) problems.push('soft: the brightness drops as the Drive rises (' + sDrops + ' times)');
      // (4) full symmetry in the fold = even curve: the fundamental disappears
      const oct = await renderF336(st({ filterDrive: 1, driveChar: 'fold', driveAsym: 1 }));
      const h1o = harm336(oct, 1) / harm336(oct, 2);
      if (!(h1o < 0.0316)) problems.push('fully symmetric fold: fundamental ' + dB(h1o) + ' below the 2nd (expected < −30 dB)');
      loadState({});
      console.log('drive: asymmetric H2 ' + dB(h2a) + ' DC ' + dB(dca) + ' · symmetric H2 ' + dB(h2s) + ' · silence ' + dB(sil) +
        ' · fold brightness ' + cF.map(x => x.toFixed(2)).join(' ') + ' · soft ' + cS.map(x => x.toFixed(2)).join(' ') + ' · symmetry H1/H2 ' + dB(h1o));
      r = { name: NAME, peak: 0, ok: !problems.length, problems };
    } catch (e2) {
      r = { name: NAME, peak: 0, ok: false, problems: ['exception: ' + ((e2 && e2.message) || e2)] };
    }
    push(r);
  }

  {
    // Tempo LFO (Roadmap 7.0 · 2.2). (1) A global LFO with sync 1/8 at 120 BPM runs at
    // 4 Hz and its cycle (sine: upward crossing = phase 0) lands on the grid of an
    // origin anchored the way the conductor anchors it (±1 ms); after switching to 90 BPM, at 3 Hz and
    // on the NEW grid. (2) «retrig»: two notes that start at different
    // times move the same from their start (in «global», they do not). (3) «once»:
    // the LFO runs one cycle and stays still.
    body.appendChild(el('st-cat', 'Tempo LFO'));
    const NAME = 'tempo LFO (sync on the grid · BPM change · per-note retrig · once)';
    let r;
    try {
      const problems = [];
      // (1)
      const ctxS = new OfflineAudioContext(1, SR * 2, SR), clkS = clockOf(ctxS);
      clkS.anchor('director', 0.137, 120);
      loadState({ cutLfoSync: '1/8' });
      const eS = new AudioEngine(); eS.S = structuredClone(engine.S); await eS.init(ctxS);
      // it is hooked to the output at 0.6 s, as when a voice uses it: if the LFO did not run with nobody
      // listening (Chrome does not process what does not reach the destination), it would come out off the grid
      ctxS.suspend(0.6).then(() => { eS.cutLFO.out.connect(ctxS.destination); ctxS.resume(); });
      ctxS.suspend(1.0).then(() => { eS.set('bpm', 90); ctxS.resume(); });
      const dS = (await ctxS.startRendering()).getChannelData(0), ups = [];
      for (let i = 1; i < dS.length; i++) if (dS[i - 1] < 0 && dS[i] >= 0) ups.push((i - 1 + dS[i - 1] / (dS[i - 1] - dS[i])) / SR);
      const pre = ups.filter(t => t > 0.62 && t < 0.99), post = ups.filter(t => t > 1.1);
      const offGrid = (ts, timeAtBeat, div) => Math.max(...ts.map(t => { const k = Math.round((t - timeAtBeat(0)) / (timeAtBeat(div) - timeAtBeat(0))); return Math.abs(t - timeAtBeat(k * div)); }));
      const e1 = offGrid(pre, b => 0.137 + b * 0.5, 0.5), e2 = offGrid(post, b => clkS.timeAt(b), 0.5);
      const hz1 = (pre.length - 1) / (pre[pre.length - 1] - pre[0]), hz2 = (post.length - 1) / (post[post.length - 1] - post[0]);
      if (!(Math.abs(hz1 - 4) < 0.01 && e1 < 0.001)) problems.push('120 BPM · 1/8: ' + hz1.toFixed(3) + ' Hz, ' + (e1 * 1000).toFixed(2) + ' ms from the grid');
      if (!(Math.abs(hz2 - 3) < 0.01 && e2 < 0.001)) problems.push('after switching to 90 BPM: ' + hz2.toFixed(3) + ' Hz, ' + (e2 * 1000).toFixed(2) + ' ms from the new grid');
      // (2) and (3): raw cutoff LFO → Amplitude through the matrix, envelope by note periods
      const st = o => { loadState({ waveA: 'sine', levelA: 0.6, levelB: 0, cutoff: 20000, reso: 0, a: 0.002, d: 0.05, s: 1, r: 0.05, width: 0,
        cutLfoSpd: 2, mx1src: 'lfoCut', mx1dst: 'amp', mx1amt: 0.5, ...o }); return structuredClone(engine.S); };
      const envFrom = async (S, at) => {
        const ctx = new OfflineAudioContext(1, Math.ceil(SR * (at + 1.3)), SR), eng = new AudioEngine(); eng.S = S; await eng.init(ctx);
        ctx.suspend(Math.round(at * SR / 128) * 128 / SR).then(() => { eng.noteOn('t', F336, 1); ctx.resume(); });
        const d = (await ctx.startRendering()).getChannelData(0);
        let i0 = 0; while (i0 < d.length && Math.abs(d[i0]) < 1e-4) i0++;
        const env = []; for (let i = i0 + 336 * 4; i + 336 <= Math.min(d.length, i0 + SR * 1.2); i += 336) { let e = 0; for (let k = i; k < i + 336; k++) e += d[k] * d[k]; env.push(Math.sqrt(e / 336)); }
        return env;
      };
      const rel = (a, b) => { let d = 0, e = 0; for (let i = 0; i < Math.min(a.length, b.length); i++) { d += (a[i] - b[i]) ** 2; e += a[i] ** 2; } return Math.sqrt(d / e); };
      const SR2 = st({ lfoPhase: 'retrig' }), SG = st({ lfoPhase: 'global' });
      const dRe = rel(await envFrom(SR2, 0), await envFrom(structuredClone(SR2), 0.37)), dGl = rel(await envFrom(SG, 0), await envFrom(structuredClone(SG), 0.37));
      if (!(dRe < 0.01 && dGl > 0.1)) problems.push('retrig: two notes differ by ' + dRe.toFixed(4) + ' (global: ' + dGl.toFixed(3) + ')');
      const eOnce = await envFrom(st({ lfoPhase: 'once' }), 0);
      const nOnce = Math.round((0.5 - 4 * 336 / SR) / (336 / SR)), during = eOnce.slice(0, nOnce), after = eOnce.slice(nOnce + 6);
      const swing = Math.max(...during) / Math.min(...during), still = Math.max(...after) / Math.min(...after);
      if (!(swing > 1.5 && still < 1.01)) problems.push('once: swings ×' + swing.toFixed(2) + ' in its cycle and ×' + still.toFixed(3) + ' afterwards (expected still)');
      loadState({});
      console.log('tempo lfo: 120 BPM 1/8 ' + hz1.toFixed(3) + ' Hz at ' + (e1 * 1000).toFixed(3) + ' ms · 90 BPM ' + hz2.toFixed(3) + ' Hz at ' + (e2 * 1000).toFixed(3) +
        ' ms · retrig ' + dRe.toFixed(4) + ' (global ' + dGl.toFixed(3) + ') · once cycle ×' + swing.toFixed(2) + ' afterwards ×' + still.toFixed(4));
      r = { name: NAME, peak: 0, ok: !problems.length, problems };
    } catch (e2) {
      r = { name: NAME, peak: 0, ok: false, problems: ['exception: ' + ((e2 && e2.message) || e2)] };
    }
    push(r);
  }

  {
    // Mod Env (Roadmap 7.0 · 2.1), its raw output on a separate channel: (1) loop with
    // A 10 ms + D 90 ms = periodic at EXACTLY 0.1 s (the signal shifted by 4410 samples
    // matches), from 0 to 1; on release, it continues from where it was (no jump) and reaches 0
    // within R; (2) trigger with a 20 ms note: the whole curve (at t0 + A + D it is at the
    // sustain, at t0 + A + D + R it is 0), and in normal the same note cuts it earlier;
    // (3) normal: holds at S while pressed.
    body.appendChild(el('st-cat', 'Mod Env'));
    const NAME = 'Mod Env (exact loop · release from its point · whole trigger · sustain)';
    let r;
    try {
      const problems = [];
      const run = async (o, offAt, secs = 1.6) => {
        loadState({ waveA: 'sine', levelA: 0.5, levelB: 0, a: 0.002, s: 1, r: 0.6, mx1src: 'envm', mx1dst: 'pan', mx1amt: 0.5, ...o });
        const ctx = new OfflineAudioContext(3, Math.ceil(SR * secs), SR), eng = new AudioEngine(); eng.S = structuredClone(engine.S); await eng.init(ctx);
        const m = ctx.createChannelMerger(3); m.connect(ctx.destination);
        eng.noteOn('t', NOTE1, 1);
        const v = eng.voices.get('t'); v.envm.out.connect(m, 0, 2);
        ctx.suspend(Math.round(offAt * SR / 128) * 128 / SR).then(() => { eng.noteOff('t'); ctx.resume(); });
        return { d: (await ctx.startRendering()).getChannelData(2), t0: v.t0, tOff: Math.round(offAt * SR / 128) * 128 / SR };
      };
      const at = (x, t) => x.d[Math.round(t * SR)];
      // (1) loop
      const B = await run({ envmMode: 'loop', envmA: 0.01, envmD: 0.09, envmR: 0.2 }, 0.8);
      let per = 0, mx = 0, mn = 1;
      for (let i = Math.round((B.t0 + 0.05) * SR); i < Math.round((B.t0 + 0.6) * SR); i++) { per = Math.max(per, Math.abs(B.d[i] - B.d[i + 4410])); mx = Math.max(mx, B.d[i]); mn = Math.min(mn, B.d[i]); }
      const iOff = Math.round(B.tOff * SR), jump = Math.abs(B.d[iOff] - B.d[iOff - 1]), endB = Math.abs(at(B, B.tOff + 0.2 + 0.02));
      if (!(per < 2e-3 && mx > 0.99 && mn < 0.01)) problems.push('loop: 0.1 s period with error ' + per.toExponential(1) + ', range ' + mn.toFixed(3) + '…' + mx.toFixed(3));
      if (!(jump < 0.02 && endB < 1e-3)) problems.push('loop on release: jump ' + jump.toFixed(3) + ', after R ' + endB.toFixed(4));
      // (2) trigger against normal with a 20 ms note
      const env = { envmA: 0.01, envmD: 0.2, envmS: 0.5, envmR: 0.3 };
      const P = await run({ envmMode: 'trigger', ...env }, 0.02), N = await run({ envmMode: 'normal', ...env }, 0.02);
      const pS = at(P, P.t0 + 0.21), pEnd = at(P, P.t0 + 0.52), nMid = at(N, N.t0 + 0.21);
      if (!(Math.abs(pS - 0.5) < 0.02 && Math.abs(pEnd) < 0.01)) problems.push('trigger: at A + D it is ' + pS.toFixed(3) + ' (expected 0.5) and after R ' + pEnd.toFixed(3));
      if (!(nMid < 0.4)) problems.push('normal with 20 ms: does not release (' + nMid.toFixed(3) + ' at A + D)');
      // (3) normal sustain
      const H = await run({ envmMode: 'normal', ...env }, 1.2);
      const hS = at(H, H.t0 + 0.8);
      if (!(Math.abs(hS - 0.5) < 0.005)) problems.push('normal: holds at ' + hS.toFixed(3) + ' (expected 0.5)');
      loadState({});
      console.log('mod env: loop error ' + per.toExponential(1) + ' range ' + mn.toFixed(3) + '…' + mx.toFixed(3) + ' jump on release ' + jump.toFixed(4) +
        ' · trigger A+D ' + pS.toFixed(3) + ' after R ' + pEnd.toFixed(4) + ' · normal 20 ms ' + nMid.toFixed(3) + ' · sustain ' + hS.toFixed(3));
      r = { name: NAME, peak: 0, ok: !problems.length, problems };
    } catch (e2) {
      r = { name: NAME, peak: 0, ok: false, problems: ['exception: ' + ((e2 && e2.message) || e2)] };
    }
    push(r);
  }

  {
    // Steps (Roadmap 7.0 · 2.3): (1) the staircase of the continuous flavor over time —
    // exact values at the middle of each step and steps on the grid —, smoothing 0 with no
    // click (the maximum jump between samples from −1 to +1 is that of a 4 ms ramp) and
    // smoothing 1 = a ramp over the whole step; (2) arithmetic: rotation + drift, the cycle
    // of 16 · 12 · 5 = 15 bars (and with drift); (3) «· note» takes the step in which
    // the note starts; (4) reset «on play»: after the silence the phrase goes back to
    // step 0 (with «never», it carries on where it was).
    body.appendChild(el('st-cat', 'Steps'));
    const NAME = 'Steps (exact staircase · no click · smoothing · rotation and drift · cycle · per note · reset)';
    let r;
    try {
      const problems = [], step = 0.125;   // 1/16 at 120 BPM
      const base = { waveA: 'sine', levelA: 0.5, levelB: 0, a: 0.002, s: 1, r: 0.05, bpm: 120, st1Pat: '1 -1 0.5 0', st1Div: '1/16' };
      // (1)
      const raw = async o => {
        loadState({ ...base, mx1src: 'st1', mx1dst: 'pan', mx1amt: 0.5, ...o });
        const ctx = new OfflineAudioContext(3, Math.ceil(SR * 2.2), SR), eng = new AudioEngine(); eng.S = structuredClone(engine.S); await eng.init(ctx);
        const m = ctx.createChannelMerger(3); m.connect(ctx.destination);
        eng.noteOn('t', NOTE1, 1); eng.steps.src[1].connect(m, 0, 2);
        return (await ctx.startRendering()).getChannelData(2);
      };
      const d0 = await raw({ st1Smooth: 0 }), want = [1, -1, 0.5, 0];
      let errV = 0, jump = 0;
      for (let k = 0; k < 16; k++) errV = Math.max(errV, Math.abs(d0[Math.round((k + 0.5) * step * SR)] - want[k % 4]));
      for (let i = 1; i < Math.round(2 * SR); i++) jump = Math.max(jump, Math.abs(d0[i] - d0[i - 1]));
      const edge = d0[Math.round((step + 0.002) * SR)];   // halfway through the 4 ms ramp of step 1 (from 1 to −1)
      if (!(errV < 1e-6)) problems.push('staircase: error ' + errV.toExponential(1) + ' at mid-step');
      if (!(jump < 0.02 && Math.abs(edge) < 0.15)) problems.push('step edge: maximum jump ' + jump.toFixed(4) + ' per sample, 2 ms into the step ' + edge.toFixed(3));
      const d1 = await raw({ st1Smooth: 1 });
      const mid1 = d1[Math.round(1.5 * step * SR)];        // step 1 halfway: from 1 towards −1 = 0
      if (!(Math.abs(mid1) < 0.01)) problems.push('smoothing 1: halfway through the step it is ' + mid1.toFixed(3) + ' (expected 0)');
      // (2) arithmetic on a mock engine (no audio)
      const fakeCtx = { currentTime: 0 }, clk = clockOf(fakeCtx); clk.anchor('d', 0, 120);
      const fe = { ctx: fakeCtx, bpm: 120, S: { ...structuredClone(engine.S), stReset: 'never', st2Pat: '0 0.25 0.5 0.75 1', st2Div: '1/16', st2Rot: 2, st2Drift: '1 bar' } };
      const sp = new Steps(fe);
      const r0 = sp.valueAt(2, 0.01), r16 = sp.valueAt(2, 2.01);   // step 0: index 2 · step 16 (bar 1): 16 + 2 + 1 = 19 → 4
      if (!(r0 === 0.5 && r16 === 1)) problems.push('rotation and drift: ' + r0 + ' / ' + r16 + ' (expected 0.5 / 1)');
      const cyc = cycleBars({ st1Pat: Array(16).fill(0).join(' '), st2Pat: Array(12).fill(0).join(' '), st3Pat: '0 0 0 0 0', st1Div: '1/16', st2Div: '1/16', st3Div: '1/16', stReset: 'play' }, [1, 2, 3]);
      const cycD = cycleBars({ st1Pat: Array(16).fill(0).join(' '), st3Pat: '0 0 0 0 0', st1Div: '1/16', st3Div: '1/16', st3Drift: '2 bars', stReset: 'play' }, [1, 3]);
      if (!(cyc === 15 && cycD === 10)) problems.push('cycle: 16 · 12 · 5 = ' + cyc + ' bars (expected 15); 16 · 5 with a 2-bar drift = ' + cycD + ' (expected 10)');
      // (3) and (4): per note and reset, reading each voice's fixed value
      const perNote = async (reset, idleBetween) => {
        loadState({ ...base, mx1src: 'st1n', mx1dst: 'pan', mx1amt: 0.5, stReset: reset });
        const ctx = new OfflineAudioContext(2, Math.ceil(SR * 2), SR), eng = new AudioEngine(); eng.S = structuredClone(engine.S); await eng.init(ctx);
        const vals = [];
        eng.noteOn('a', NOTE1, 1); vals.push(eng.voices.get('a')._mxConsts.st1n.offset.value);
        ctx.suspend(Math.round(0.3 * SR / 128) * 128 / SR).then(() => { eng.noteOn('b', NOTE2, 1); vals.push(eng.voices.get('b')._mxConsts.st1n.offset.value); eng.noteOff('a'); eng.noteOff('b'); ctx.resume(); });
        ctx.suspend(Math.round(1.37 * SR / 128) * 128 / SR).then(() => { if (idleBetween) eng.steps.idle(); eng.noteOn('c', NOTE1, 1); vals.push(eng.voices.get('c')._mxConsts.st1n.offset.value); vals.t0c = eng.voices.get('c').t0; ctx.resume(); });
        await ctx.startRendering();
        return vals;
      };
      const pPlay = await perNote('play', true), pNever = await perNote('never', true);
      // a: step 0 (1) · b at 0.30 s: step 2 (0.5) · c at 1.37 s after the silence: «on play» = step 0 (1);
      // «never» = the step its start falls on (t0 = key + look-ahead: 11 → 0), which is not 0
      const wantN = want[Math.floor(pNever.t0c / step + 1e-9) % 4];
      if (!(pPlay[0] === 1 && pPlay[1] === 0.5)) problems.push('per note: ' + pPlay.slice(0, 2).join(' / ') + ' (expected 1 / 0.5)');
      if (!(pPlay[2] === 1 && pNever[2] === wantN && wantN !== 1)) problems.push('reset: after the silence «on play» ' + pPlay[2] + ' (expected 1), «never» ' + pNever[2] + ' (expected ' + wantN + ')');
      loadState({});
      console.log('steps: staircase error ' + errV.toExponential(1) + ' · max jump ' + jump.toFixed(4) + ' · smoothing 1 halfway ' + mid1.toFixed(4) + ' · rotation/drift ' + r0 + ' ' + r16 +
        ' · cycle ' + cyc + ' and ' + cycD + ' bars · per note ' + pPlay.join(' ') + ' · never ' + pNever.join(' '));
      r = { name: NAME, peak: 0, ok: !problems.length, problems };
    } catch (e2) {
      r = { name: NAME, peak: 0, ok: false, problems: ['exception: ' + ((e2 && e2.message) || e2)] };
    }
    push(r);
  }

  {
    // New matrix targets (Roadmap 7.0 · 2.4), each one moves what it says
    // (velocity 1 as a constant source): Level A and B at 0 silence their oscillator; Level
    // Noise and Level Ring make what was at 0 sound; Pitch A raises A by an octave
    // and not B. (Material through the matrix: in the resonator check, which measures the
    // tuning of the modes in their free tail.)
    body.appendChild(el('st-cat', 'Matrix · new targets'));
    const NAME = 'matrix · new targets (levels A/B/Ring/noise · Pitch A)';
    let r;
    try {
      const problems = [], base = { waveA: 'sine', waveB: 'sine', levelA: 0, levelB: 0, cutoff: 20000, reso: 0, a: 0.005, d: 0.05, s: 1, r: 0.05, width: 0 };
      const st = o => { loadState({ ...base, ...o }); return structuredClone(engine.S); };
      const rms = d => Math.sqrt(d.reduce((a, x) => a + x * x, 0) / d.length);
      const mx = (dst, amt) => ({ mx1src: 'vel', mx1dst: dst, mx1amt: amt });
      const lA = rms(await renderF336(st({ levelA: 0.5, ...mx('lvlA', -0.5) }))), lA0 = rms(await renderF336(st({ levelA: 0.5 })));
      const lB = rms(await renderF336(st({ levelB: 0.5, ...mx('lvlB', -0.5) })));
      const lN = rms(await renderF336(st({ ...mx('lvlNoise', 0.5) })));
      const lR = rms(await renderF336(st({ ...mx('lvlRing', 1) })));
      if (!(lA < 1e-5 && lA0 > 0.01)) problems.push('Level A: with −0.5 over 0.5 it sounds at ' + dB(lA) + ' (without matrix ' + dB(lA0) + ')');
      if (!(lB < 1e-5)) problems.push('Level B: with −0.5 over 0.5 it sounds at ' + dB(lB));
      if (!(lN > 0.01)) problems.push('Level Noise: the noise does not appear (' + dB(lN) + ')');
      if (!(lR > 0.01)) problems.push('Level Ring: the ring does not appear (' + dB(lR) + ')');
      const pA = await renderF336(st({ levelA: 1, ...mx('pitchA', 1) })), pB = await renderF336(st({ levelB: 1, ...mx('pitchA', 1) }));
      const qA = harm336(pA, 2) / Math.max(1e-12, harm336(pA, 1)), qB = harm336(pB, 1) / Math.max(1e-12, harm336(pB, 2));
      if (!(qA > 100)) problems.push('Pitch A: A does not rise an octave (2f/f ' + qA.toFixed(1) + ')');
      if (!(qB > 100)) problems.push('Pitch A: it also moves B (f/2f ' + qB.toFixed(1) + ')');
      loadState({});
      console.log('matrix targets: level A ' + dB(lA) + ' (without matrix ' + dB(lA0) + ') · B ' + dB(lB) + ' · noise ' + dB(lN) + ' · ring ' + dB(lR) +
        ' · pitch A 2f/f ' + qA.toFixed(0) + ' · B f/2f ' + qB.toFixed(0) + ' (Material: in the resonator check)');
      r = { name: NAME, peak: 0, ok: !problems.length, problems };
    } catch (e2) {
      r = { name: NAME, peak: 0, ok: false, problems: ['exception: ' + ((e2 && e2.message) || e2)] };
    }
    push(r);
  }

  {
    // wave editor: (1) the short DFT recovers a known spectrum
    // (sine h1 + cosine h3), (2) points→spectrum→points reproduces the drawing
    // (band-limited input by construction), (3) the 'user' table (default
    // sine/saw frames on a clean profile) gives morph 0 ≠ 1.
    body.appendChild(el('st-cat', 'Wave Editor'));
    let r;
    try {
      const P = 256, pts = new Array(P);
      for (let i = 0; i < P; i++) pts[i] = Math.sin(2 * Math.PI * i / P) + 0.5 * Math.cos(2 * Math.PI * 3 * i / P);
      const sp = spectrumOf(pts);
      const okDft = Math.abs(sp.sin[0] - 1) < 0.01 && Math.abs(sp.cos[2] - 0.5) < 0.01 &&
                    Math.abs(sp.sin[2]) < 0.01 && Math.abs(sp.cos[0]) < 0.01;
      const back = pointsFromSpectrum(sp, P);
      let err = 0; for (let i = 0; i < P; i++) err = Math.max(err, Math.abs(back[i] - pts[i]));
      const okRt = err < 0.02;
      // default frames DURING the test (the user may have drawn A≈B); restored on the way out
      const prevWt = localStorage.getItem(WT_LS);
      saveUserFrames(defaultUserFrames());
      loadState({ waveA: 'wavetable', wtSet: 'user', levelA: 1, levelB: 0, wtPos: 0 });
      const bA = await renderBuf(structuredClone(engine.S));
      loadState({ waveA: 'wavetable', wtSet: 'user', levelA: 1, levelB: 0, wtPos: 1 });
      const bB = await renderBuf(structuredClone(engine.S));
      if (prevWt === null) localStorage.removeItem(WT_LS); else localStorage.setItem(WT_LS, prevWt);
      invalidateUserSet();
      const aA = analyze(bA), aB = analyze(bB);
      const cA = bA.getChannelData(0), cB = bB.getChannelData(0);
      let d = 0, en = 0;
      for (let i = 0; i < cA.length; i += 16) { const x = cA[i] - cB[i]; d += x * x; en += cA[i] * cA[i]; }
      const diff = Math.sqrt(d / Math.max(1e-12, en));
      // wtUser recipe: encode/decode reproduces the frames (it travels in the preset)
      const fr0 = defaultUserFrames(), fr1 = decodeUserFrames(encodeUserFrames(fr0));
      let errEnc = fr1 && fr1.length === fr0.length ? 0 : 1;
      if (!errEnc) for (let i = 0; i < fr0.length; i++)
        for (let k = 0; k < fr0[i].length; k++) errEnc = Math.max(errEnc, Math.abs(fr1[i][k] - fr0[i][k]));
      const okEnc = errEnc < 0.001 && decodeUserFrames('') === null && decodeUserFrames('1,2;3') === null;
      const problems = [];
      if (!okDft) problems.push('DFT does not recover the spectrum (h1s ' + sp.sin[0].toFixed(3) + ' h3c ' + sp.cos[2].toFixed(3) + ')');
      if (!okRt) problems.push('round trip with error ' + err.toFixed(4));
      if (!okEnc) problems.push('wtUser recipe does not reproduce the frames (err ' + errEnc + ')');
      if (aA.bad || aB.bad) problems.push('NaN/Inf');
      if (aA.peak <= SILENCE || aB.peak <= SILENCE) problems.push('silence (' + dB(aA.peak) + ' / ' + dB(aB.peak) + ')');
      if (!(diff > 0.3)) problems.push('user: morph 0 vs 1 barely differs (diff ' + diff.toFixed(3) + ')');
      r = { name: 'wave editor (DFT · round trip · user A≠B)', peak: aB.peak, ok: !problems.length, problems };
    } catch (e2) {
      r = { name: 'wave editor (DFT · round trip · user A≠B)', peak: 0, ok: false,
            problems: ['exception: ' + ((e2 && e2.message) || e2)] };
    }
    push(r);
  }

  {
    // vocal (formant bank): (1) turning the bank on CLEARLY changes the
    // render against the dry one (the stage sounds and the makeup neither silences it nor
    // blows it up), (2) vowel /u/ ≠ /i/ (vowel identity is spectral and
    // the morph via WaveShaper→detune really moves it). Deterministic:
    // base saw without randomness and vocLife at 0.
    body.appendChild(el('st-cat', 'Vocal'));
    let r;
    try {
      loadState({});
      const bDry = await renderBuf(structuredClone(engine.S));
      loadState({ vocAmt: 1, vocVowel: 0.5 });
      const bA = await renderBuf(structuredClone(engine.S));
      loadState({ vocAmt: 1, vocVowel: 0 });
      const bU = await renderBuf(structuredClone(engine.S));
      loadState({ vocAmt: 1, vocVowel: 1 });
      const bI = await renderBuf(structuredClone(engine.S));
      const diff = (x, y) => {
        const cX = x.getChannelData(0), cY = y.getChannelData(0);
        let d = 0, en = 0;
        for (let i = 0; i < cX.length; i += 16) { const e = cX[i] - cY[i]; d += e * e; en += cX[i] * cX[i]; }
        return Math.sqrt(d / Math.max(1e-12, en));
      };
      const aDry = analyze(bDry), aA = analyze(bA), aU = analyze(bU), aI = analyze(bI);
      const problems = [];
      if (aA.bad || aU.bad || aI.bad) problems.push('NaN/Inf');
      for (const [n, a] of [['a', aA], ['u', aU], ['i', aI]]) {
        if (a.peak <= SILENCE) problems.push('vowel /' + n + '/ silent (' + dB(a.peak) + ')');
        if (a.peak > 1) problems.push('vowel /' + n + '/ clipping (' + dB(a.peak) + ')');
      }
      const dWet = diff(bDry, bA), dVow = diff(bU, bI);
      if (!(dWet > 0.3)) problems.push('turning the bank on barely changes the render (diff ' + dWet.toFixed(3) + ')');
      if (!(dVow > 0.3)) problems.push('/u/ vs /i/ barely differ (diff ' + dVow.toFixed(3) + ')');
      r = { name: 'vocal (bank sounds · /u/ ≠ /i/)', peak: aA.peak, ok: !problems.length, problems };
    } catch (e2) {
      r = { name: 'vocal (bank sounds · /u/ ≠ /i/)', peak: 0, ok: false,
            problems: ['exception: ' + ((e2 && e2.message) || e2)] };
    }
    push(r);
  }

  {
    // vocal 2.0: (1) the glottal source really morphs (relaxed ≠ pressed:
    // effort changes the spectrum), (2) Bright moves F4-F5 (audible),
    // (3) the consonant Bite puts extra energy into the ONSET (RMS of
    // the first 50 ms clearly higher than without it), and (4) its formant
    // TRANSITION exists: the onset is «u-ish» (closed mouth, low F1)
    // against the «a-ish» sustain — measured with Goertzel on harmonics
    // 2 and 5 of C3 (262/654 Hz ≈ F1 of /u/ and of /a/), normalized against the
    // render without Bite to cancel the attack's own color.
    // The burst starts at a RANDOM point of the noise (each consonant is
    // different) and is added on top: with ONE hit, each Goertzel bin is a
    // draw and the ratio of two draws went from 6 to 238 (threshold 5: it failed
    // ~1 in 10; measured with 20 repetitions, Oct 2026). With K hits in one
    // render and the powers SUMMED before dividing (2K degrees of freedom),
    // 15-38 over 20 repetitions. Without the transition, the burst alone (centered on
    // F2) would bring the ratio below 1.
    body.appendChild(el('st-cat', 'Vocal 2.0'));
    let r;
    try {
      const diff = (x, y) => {
        const cX = x.getChannelData(0), cY = y.getChannelData(0);
        let d = 0, en = 0;
        for (let i = 0; i < cX.length; i += 16) { const e = cX[i] - cY[i]; d += e * e; en += cX[i] * cX[i]; }
        return Math.sqrt(d / Math.max(1e-12, en));
      };
      // K C3 notes in one render, one every P (block boundary), released at 0.5 s with a short release
      const K = 8, P = 206 * 128 / SR;
      const renderK = async st => {
        loadState(st);
        const ctx = new OfflineAudioContext(2, Math.ceil(SR * K * P), SR);
        const eng = new AudioEngine(); eng.S = structuredClone(engine.S); await eng.init(ctx);
        eng.noteOn('n0', NOTE1);
        for (let i = 0; i < K; i++) {
          if (i) ctx.suspend(i * P).then(() => { eng.noteOn('n' + i, NOTE1); ctx.resume(); });
          ctx.suspend(i * P + 0.5).then(() => { eng.noteOff('n' + i); ctx.resume(); });
        }
        return ctx.startRendering();
      };
      loadState({ waveA: 'wavetable', wtSet: 'glottal', levelA: 1, levelB: 0, wtPos: 0 });
      const bG0 = await renderBuf(structuredClone(engine.S));
      loadState({ waveA: 'wavetable', wtSet: 'glottal', levelA: 1, levelB: 0, wtPos: 1 });
      const bG1 = await renderBuf(structuredClone(engine.S));
      loadState({ vocAmt: 1, vocBright: 0 });
      const bB0 = await renderBuf(structuredClone(engine.S));
      loadState({ vocAmt: 1, vocBright: 1 });
      const bB1 = await renderBuf(structuredClone(engine.S));
      const bK0 = await renderK({ vocAmt: 1, vocAtk: 0, a: 0.005, r: 0.02 });
      const bK1 = await renderK({ vocAmt: 1, vocAtk: 1, a: 0.005, r: 0.02 });
      const problems = [];
      const aG0 = analyze(bG0), aG1 = analyze(bG1), aB1 = analyze(bB1), aK1 = analyze(bK1);
      if (aG0.bad || aG1.bad || aB1.bad || aK1.bad) problems.push('NaN/Inf');
      if (aG0.peak <= SILENCE || aG1.peak <= SILENCE) problems.push('glottal silent (' + dB(aG0.peak) + ' / ' + dB(aG1.peak) + ')');
      if (aG1.peak > 1 || aK1.peak > 1) problems.push('clipping (glottal ' + dB(aG1.peak) + ' · bite ' + dB(aK1.peak) + ')');
      const dG = diff(bG0, bG1), dB_ = diff(bB0, bB1);
      const sumK = (b, fn, t0, t1) => { const d = b.getChannelData(0); let s = 0; for (let i = 0; i < K; i++) s += fn(d, i * P + t0, i * P + t1); return s; };
      const en = (d, t0, t1) => { let s = 0; for (let i = Math.floor(t0 * SR); i < Math.floor(t1 * SR); i++) s += d[i] * d[i]; return s; };
      const kRatio = Math.sqrt(sumK(bK1, en, 0, 0.05) / Math.max(1e-12, sumK(bK0, en, 0, 0.05)));   // RMS of the first 50 ms
      const goe = f => (d, t0, t1) => {         // Goertzel energy of a tone in a window
        const i0 = Math.floor(t0 * SR), i1 = Math.min(d.length, Math.floor(t1 * SR));
        const cw = 2 * Math.cos(2 * Math.PI * f / SR);
        let s1 = 0, s2 = 0;
        for (let i = i0; i < i1; i++) { const s0 = d[i] + cw * s1 - s2; s2 = s1; s1 = s0; }
        return s1 * s1 + s2 * s2 - cw * s1 * s2;
      };
      const uVsA = (b, t0, t1) => sumK(b, goe(261.62), t0, t1) / Math.max(1e-12, sumK(b, goe(654.06), t0, t1));
      const rr = b => uVsA(b, 0.008, 0.045) / Math.max(1e-12, uVsA(b, 0.3, 0.5));
      const trans = rr(bK1) / Math.max(1e-6, rr(bK0));   // measured 15-38 (median 24) over 20 repetitions
      if (!(dG > 0.3)) problems.push('glottal: effort 0 vs 1 barely differs (diff ' + dG.toFixed(3) + ')');
      if (!(dB_ > 0.05)) problems.push('Bright 0 vs 1 barely differs (diff ' + dB_.toFixed(3) + ')');
      if (!(kRatio > 1.2)) problems.push('the Bite adds no energy to the onset (ratio ' + kRatio.toFixed(2) + ')');
      if (!(trans > 5)) problems.push('the Bite does not start with the mouth closed (transition ' + trans.toFixed(1) + ')');
      console.log('vocal 2: glottal diff', dG.toFixed(3), '· bright diff', dB_.toFixed(3), '· bite onset ×' + kRatio.toFixed(2), '· transition', trans.toFixed(1), '(' + K + ' hits)');
      r = { name: 'vocal 2.0 (glottal morphs · bright · bite + transition)', peak: aK1.peak, ok: !problems.length, problems };
    } catch (e2) {
      r = { name: 'vocal 2.0 (glottal morphs · bright · bite + transition)', peak: 0, ok: false,
            problems: ['exception: ' + ((e2 && e2.message) || e2)] };
    }
    push(r);
  }

  {
    // wave sequence (wave sequencing): (1) the parser reads frames/holds
    // and clamps to 0..7, (2) sequencing CLEARLY changes the render against the
    // static morph, (3) in '1shot' the phrase converges: with '0 7' the FINAL
    // stretch must sound identical to a static wtPos=1 (the automation ends
    // stuck on the last frame) while the ONSET differs (it starts at 0).
    // Deterministic: the offline scheduling is all done in the noteOn, no timers.
    body.appendChild(el('st-cat', 'Wave Sequence'));
    let r;
    try {
      const p = parseWsPattern('0 7 . 3 9 -2');
      const okParse = p.length === 6 && p[0] === 0 && p[1] === 7 && p[2] === null &&
                      p[3] === 3 && p[4] === 7 && p[5] === 0 && parseWsPattern('').length === 0;
      const base = { waveA: 'wavetable', levelA: 1, levelB: 0, wtPos: 0, bpm: 120 };
      loadState(base);
      const bOff = await renderBuf(structuredClone(engine.S));
      loadState({ ...base, wsOn: 'on', wsPat: '0 7', wsDiv: '1/16', wsXf: 0.1 });
      const bLoop = await renderBuf(structuredClone(engine.S));
      loadState({ ...base, wsOn: 'on', wsPat: '0 7', wsDiv: '1/16', wsXf: 0.1, wsMode: '1shot' });
      const b1s = await renderBuf(structuredClone(engine.S));
      loadState({ ...base, wtPos: 1 });
      const bTop = await renderBuf(structuredClone(engine.S));
      // relative diff over a WINDOW [t0,t1) — the 1shot convergence is
      // measured where both voices have settled, the onset where they have not yet
      const diffW = (x, y, t0, t1) => {
        const cX = x.getChannelData(0), cY = y.getChannelData(0);
        const i0 = Math.floor(t0 * SR), i1 = Math.min(cX.length, Math.floor(t1 * SR));
        let d = 0, en = 0;
        for (let i = i0; i < i1; i += 4) { const e = cX[i] - cY[i]; d += e * e; en += cX[i] * cX[i]; }
        return Math.sqrt(d / Math.max(1e-12, en));
      };
      const aLoop = analyze(bLoop), a1s = analyze(b1s);
      const problems = [];
      if (aLoop.bad || a1s.bad) problems.push('NaN/Inf');
      if (aLoop.peak <= SILENCE || a1s.peak <= SILENCE) problems.push('silence (' + dB(aLoop.peak) + ' / ' + dB(a1s.peak) + ')');
      if (aLoop.peak > 1 || a1s.peak > 1) problems.push('clipping');
      if (!okParse) problems.push('parser: ' + JSON.stringify(p));
      const dOn = diffW(bOff, bLoop, 0.05, 1.0);
      if (!(dOn > 0.2)) problems.push('sequencing barely changes the render (diff ' + dOn.toFixed(3) + ')');
      const dEarly = diffW(bTop, b1s, 0.02, 0.12), dLate = diffW(bTop, b1s, 0.8, 1.0);
      if (!(dEarly > 0.2)) problems.push('1shot: the onset does not differ from the final frame (diff ' + dEarly.toFixed(3) + ')');
      if (!(dLate < 0.05)) problems.push('1shot: does not converge to the last frame (final diff ' + dLate.toFixed(3) + ')');
      r = { name: 'wave sequence (parser · audible sequence · 1shot converges)', peak: aLoop.peak, ok: !problems.length, problems };
    } catch (e2) {
      r = { name: 'wave sequence (parser · audible sequence · 1shot converges)', peak: 0, ok: false,
            problems: ['exception: ' + ((e2 && e2.message) || e2)] };
    }
    push(r);
  }

  {
    // tape delay: its OWN render of a single note (C3, pluck with s=0: it
    // dies in ~60 ms) so that the echoes are clean copies of the note.
    // (1) at Damp 0 the loop is TRANSPARENT: the echoes have the same spectral
    // tilt (energy of the 1st difference / energy ∝ centroid) as the
    // direct note — the biquad's identity at Nyquist / 0 Hz, and 0.25 s is
    // exactly 11025 samples at 44.1 kHz (no interpolation loss);
    // (2) Damp 1 DARKENS the echoes (tilt below half) without killing them;
    // (3) the wow changes the echoes (detunes them) without NaN. Windows: direct
    // [0, 0.2) (the note dies in ~0.13 s); echoes only, L channel, [0.22, end)
    // (0.25, 0.75, 1.25, 1.75 s; Amount 0.9 ⇒ feedback 0.77, so the
    // late echoes still have energy to measure).
    body.appendChild(el('st-cat', 'Tape delay'));
    let r;
    try {
      const base = { waveA: 'sawtooth', levelA: 1, levelB: 0, cutoff: 12000, reso: 0.7, a: 0.002, d: 0.12, s: 0, r: 0.1,
                     dlyAmt: 0.9, dlyTime: 0.25, dlySync: 'free', width: 0 };
      loadState(base);
      const b0 = await renderOne(structuredClone(engine.S));
      loadState({ ...base, dlyDamp: 1 });
      const b1 = await renderOne(structuredClone(engine.S));
      loadState({ ...base, dlyWow: 1 });
      const bW = await renderOne(structuredClone(engine.S));
      const win = (buf, t0, t1) => { const d = buf.getChannelData(0); return [d, Math.floor(t0 * SR), Math.min(d.length, Math.floor(t1 * SR))]; };
      const tilt = tiltW;
      const rms = (buf, t0, t1) => { const [d, i0, i1] = win(buf, t0, t1); let s = 0;
        for (let i = i0; i < i1; i++) s += d[i] * d[i]; return Math.sqrt(s / Math.max(1, i1 - i0)); };
      const diffW = (x, y, t0, t1) => { const cX = x.getChannelData(0), cY = y.getChannelData(0);
        const i0 = Math.floor(t0 * SR), i1 = Math.min(cX.length, Math.floor(t1 * SR)); let d = 0, en = 0;
        for (let i = i0; i < i1; i += 4) { const e = cX[i] - cY[i]; d += e * e; en += cX[i] * cX[i]; }
        return Math.sqrt(d / Math.max(1e-12, en)); };
      const end = b0.length / SR;
      const a0 = analyze(b0), a1 = analyze(b1), aW = analyze(bW);
      const problems = [];
      if (a0.bad || a1.bad || aW.bad) problems.push('NaN/Inf');
      if (a0.peak > 1 || a1.peak > 1 || aW.peak > 1) problems.push('clipping');
      const T_ECHO = 0.22;
      const tDir = tilt(b0, 0, 0.2), tEcho0 = tilt(b0, T_ECHO, end), tEcho1 = tilt(b1, T_ECHO, end);
      const rEcho0 = rms(b0, T_ECHO, end), rEcho1 = rms(b1, T_ECHO, end);
      if (!(rEcho0 > 1e-3 * HR)) problems.push('no echoes in the tail window (rms ' + dB(rEcho0) + ')');
      const transp = tEcho0 / Math.max(1e-12, tDir);
      if (!(transp > 0.8 && transp < 1.25)) problems.push('at Damp 0 the echoes are not copies (echo/direct tilt ' + transp.toFixed(3) + ')');
      if (!(tEcho1 < 0.5 * tEcho0)) problems.push('Damp 1 does not darken the echoes (tilt ' + tEcho1.toExponential(2) + ' vs ' + tEcho0.toExponential(2) + ')');
      if (!(rEcho1 > 0.25 * rEcho0)) problems.push('Damp 1 kills the echoes (rms ' + dB(rEcho1) + ' vs ' + dB(rEcho0) + ')');
      const dW = diffW(b0, bW, T_ECHO, end);
      if (!(dW > 0.2)) problems.push('the wow barely changes the echoes (diff ' + dW.toFixed(3) + ')');
      console.log('tape delay: direct tilt', tDir.toExponential(3), 'echoes@0', tEcho0.toExponential(3), 'echoes@1', tEcho1.toExponential(3),
                  'echo rms', rEcho0.toFixed(4), rEcho1.toFixed(4), 'wow diff', dW.toFixed(3));
      r = { name: 'tape delay (transparent at 0 · damp darkens · wow detunes)', peak: a1.peak, ok: !problems.length, problems };
    } catch (e2) {
      r = { name: 'tape delay (transparent at 0 · damp darkens · wow detunes)', peak: 0, ok: false,
            problems: ['exception: ' + ((e2 && e2.message) || e2)] };
    }
    push(r);
  }

  {
    // Runaway delay (Roadmap 7.0 · 4.1). (1) Exact migration: a preset without
    // dlyFb gets the old feedback, 0.85·Amount capped at 0.8; one with dlyFb
    // keeps it; {} is still Reset. (2) With Saturation 0 and feedback ≤ 0.9 the
    // whole loop goes through the clean path (the usual one: saturated branch at 0). (3) Through the
    // Room, with a burst into the send: at feedback 1.1 the echo grows and SETTLES
    // (less than 1.5 dB between seconds 5-6 and 9-10, and it keeps sounding, with no NaN and without going over the
    // ceiling); at 0.5 it dies out. (4) Saturation dirties the echoes: at 1, the 3rd harmonic of
    // the repeats of a loud sine rises more than 20 dB.
    body.appendChild(el('st-cat', 'Runaway delay'));
    const NAME = 'runaway delay (exact migration · clean path at 0 · settles at 110 % · dies out at 50 % · saturation dirties)';
    let r;
    try {
      const problems = [];
      // (1) migration
      const m1 = withPresetBase({ dlyAmt: 0.5 }).dlyFb, m2 = withPresetBase({ dlyAmt: 0.9 }).dlyFb, m3 = withPresetBase({ dlyAmt: 0.3, dlyFb: 1.05 }).dlyFb;
      if (m1 !== 0.425 || m2 !== 0.765 || m3 !== 1.05 || 'dlyFb' in withPresetBase({})) problems.push('migration: ' + m1 + ' / ' + m2 + ' / ' + m3);
      // (2) and (3): the Room alone, with a sine burst into the delay send
      const roomRun = async (fb, sat, secs, amp = 0.3, f = 440) => {
        const ctx = new OfflineAudioContext(2, Math.ceil(SR * secs), SR);
        await loadWorklets(ctx);
        const st = makeDefaultState(); st.dlyTime = 0.3; st.dlySync = 'free'; st.dlyDamp = 0; st.dlyWow = 0; st.dlySat = sat;
        const room = new Room(ctx, st, { fb, dlyToRev: 0, master: 1 });
        const o = ctx.createOscillator(); o.frequency.value = f; const g = ctx.createGain(); g.gain.value = amp;
        o.connect(g); g.connect(room.dlyIn); o.start(0); o.stop(0.2);
        const clean = room.fbSatL.wet.gain.value === 0 && room.fbSatL.dry.gain.value === 1;
        return { buf: await ctx.startRendering(), clean };
      };
      const rms = (b, t0, t1) => { let s = 0, n = 0; for (let ch = 0; ch < 2; ch++) { const d = b.getChannelData(ch); for (let i = Math.floor(t0 * SR); i < Math.floor(t1 * SR); i++) { s += d[i] * d[i]; n++; } } return 10 * Math.log10(s / n + 1e-30); };
      const health = b => { let pk = 0, bad = 0; for (let ch = 0; ch < 2; ch++) for (const x of b.getChannelData(ch)) { if (!Number.isFinite(x)) bad++; else pk = Math.max(pk, Math.abs(x)); } return { pk, bad }; };
      const n0 = await roomRun(0.6, 0, 1);
      if (!n0.clean) problems.push('with Saturation 0 and feedback 0.6 the saturated branch is not at 0');
      const run = await roomRun(1.1, 0, 10.5), dec = await roomRun(0.5, 0, 10.5);
      const L56 = rms(run.buf, 5, 6), L910 = rms(run.buf, 9, 10), D12 = rms(dec.buf, 1, 2), D910 = rms(dec.buf, 9, 10);
      const sr = health(run.buf);
      if (run.clean) problems.push('at 110 % the saturation did not kick in by itself');
      if (!(Math.abs(L910 - L56) < 1.5)) problems.push('at 110 % the level does not settle (' + L56.toFixed(1) + ' → ' + L910.toFixed(1) + ' dB)');
      if (!(L910 > -40)) problems.push('at 110 % the echo dies out (' + L910.toFixed(1) + ' dB at 9 s)');
      if (sr.bad || sr.pk > 1) problems.push('at 110 %: ' + sr.bad + ' NaN samples, peak ' + sr.pk.toFixed(3));
      if (!(D910 < D12 - 40)) problems.push('at 50 % the echo does not die out (' + D12.toFixed(1) + ' → ' + D910.toFixed(1) + ' dB)');
      // (4) saturation dirties: 3rd harmonic of the repeats (0.6-1.8 s) of a loud 300 Hz sine
      const h3 = b => { const d = b.getChannelData(0), i0 = Math.floor(0.6 * SR), n = Math.floor(1.2 * SR);
        const at = f => { let re = 0, im = 0; const w = 2 * Math.PI * f / SR; for (let i = 0; i < n; i++) { const x = d[i0 + i]; re += x * Math.cos(w * i); im -= x * Math.sin(w * i); } return Math.hypot(re, im); };
        return 20 * Math.log10(at(900) / at(300)); };
      const s0 = h3((await roomRun(0.5, 0, 2, 0.9, 300)).buf), s1 = h3((await roomRun(0.5, 1, 2, 0.9, 300)).buf);
      if (!(s1 > s0 + 20)) problems.push('saturation barely dirties (3rd harmonic ' + s0.toFixed(1) + ' → ' + s1.toFixed(1) + ' dB)');
      console.log('runaway delay: 110 % ' + L56.toFixed(1) + ' / ' + L910.toFixed(1) + ' dB (s 5-6 / 9-10), peak ' + sr.pk.toFixed(2) + ' · 50 % ' + D12.toFixed(1) + ' → ' + D910.toFixed(1) + ' dB · 3rd harmonic sat 0/1 ' + s0.toFixed(1) + ' / ' + s1.toFixed(1) + ' dB');
      r = { name: NAME, peak: sr.pk, ok: !problems.length, problems };
    } catch (e2) { r = { name: NAME, peak: 0, ok: false, problems: ['exception: ' + ((e2 && e2.message) || e2)] }; }
    push(r);
  }

  {
    // FM in the matrix + feedback: (1) env→«FM index»: the index rides the
    // envelope ⇒ the spectral tilt of the ONSET is clearly greater than that
    // of the SUSTAIN (control: with a fixed index that ratio stays ≈ 1 — the
    // amplitude does not enter the tilt); (2) velocity→index: hitting hard (vel
    // 1) gives more brightness than hitting softly (vel 0.3); (3) the modulator's
    // feedback adds harmonics (tilt rises) — measured at MAXIMUM feedback
    // (chaotic loop, broad spectrum): with medium feedback the gain
    // depends on the modulator's random phase (1.3-2.4×) and the check
    // was flaky — and at full + maximum index it produces no NaN or clipping (the
    // carrier is a sine: ≤ 1 by construction).
    body.appendChild(el('st-cat', 'FM in the matrix'));
    let r;
    try {
      const base = { waveA: 'sine', waveB: 'sine', levelA: 0.5, levelB: 0.5, fmRatio: 2, fmIndex: 0.5, cutoff: 20000,
                     a: 0.002, d: 0.4, s: 0.1, r: 0.1, width: 0 };
      const opt = { secs: 1.2, offAt: 1.0 };
      loadState(base);
      const bFix = await renderOne(structuredClone(engine.S), opt);
      loadState({ ...base, mx1src: 'env', mx1dst: 'fm', mx1amt: 0.8 });
      const bEnv = await renderOne(structuredClone(engine.S), opt);
      loadState({ ...base, mx1src: 'vel', mx1dst: 'fm', mx1amt: 0.8 });
      const bVelHi = await renderOne(structuredClone(engine.S), { ...opt, vel: 1 });
      const bVelLo = await renderOne(structuredClone(engine.S), { ...opt, vel: 0.3 });
      loadState({ ...base, fmIndex: 2, fmFb: 0 });
      const bFb0 = await renderOne(structuredClone(engine.S), opt);
      loadState({ ...base, fmIndex: 2, fmFb: 1 });
      const bFb1 = await renderOne(structuredClone(engine.S), opt);
      loadState({ ...base, fmIndex: 12, fmFb: 1 });
      const bFbMax = await renderOne(structuredClone(engine.S), opt);
      const problems = [];
      const aEnv = analyze(bEnv), aFb1 = analyze(bFb1), aMax = analyze(bFbMax);
      if (aEnv.bad || aFb1.bad || aMax.bad) problems.push('NaN/Inf');
      if (aEnv.peak > 1 || aFb1.peak > 1 || aMax.peak > 1) problems.push('clipping');
      if (aMax.peak <= SILENCE) problems.push('full feedback is silent (' + dB(aMax.peak) + ')');
      // onset [0.01, 0.06) vs sustain [0.6, 0.95): the decay (0.4 s) is already over
      const ratioEnv = tiltW(bEnv, 0.01, 0.06) / Math.max(1e-12, tiltW(bEnv, 0.6, 0.95));
      const ratioFix = tiltW(bFix, 0.01, 0.06) / Math.max(1e-12, tiltW(bFix, 0.6, 0.95));
      if (!(ratioEnv > 2.5)) problems.push('env→FM does not brighten the onset (onset/sustain tilt ' + ratioEnv.toFixed(2) + ')');
      if (!(ratioFix < 1.5)) problems.push('control: with a fixed index the onset already differs (' + ratioFix.toFixed(2) + ')');
      const tHi = tiltW(bVelHi, 0.2, 0.95), tLo = tiltW(bVelLo, 0.2, 0.95);
      if (!(tHi > 1.3 * tLo)) problems.push('vel→FM: hitting hard does not brighten (tilt ' + tHi.toExponential(2) + ' vs ' + tLo.toExponential(2) + ')');
      const tF0 = tiltW(bFb0, 0.2, 0.95), tF1 = tiltW(bFb1, 0.2, 0.95);
      if (!(tF1 > 1.3 * tF0)) problems.push('the feedback adds no harmonics (tilt ' + tF1.toExponential(2) + ' vs ' + tF0.toExponential(2) + ')');
      console.log('fm matrix: env onset/sustain', ratioEnv.toFixed(2), 'control', ratioFix.toFixed(2),
                  'vel hi/lo', (tHi / Math.max(1e-12, tLo)).toFixed(2), 'fb 1/0', (tF1 / Math.max(1e-12, tF0)).toFixed(2), 'fb max peak', dB(aMax.peak));
      r = { name: 'FM in the matrix (env→index · vel→index · feedback)', peak: aMax.peak, ok: !problems.length, problems };
    } catch (e2) {
      r = { name: 'FM in the matrix (env→index · vel→index · feedback)', peak: 0, ok: false,
            problems: ['exception: ' + ((e2 && e2.message) || e2)] };
    }
    push(r);
  }

  {
    // Parts (Roadmap 4.0 · C1): (1) state↔controls: applyPreset and toControls
    // are inverses and respect the defaults; (2) offline scene with 4 parts
    // over ONE Room: each part sounds in its window, the muted one does not, with no
    // NaN or clipping; (3) the room is shared: a BPM change from one
    // part and a predelay change from the room reach every part's S; (4) part 4's
    // reverb send leaves a tail in the room once its VCA has closed.
    body.appendChild(el('st-cat', 'Parts'));
    let r;
    try {
      const problems = [];
      const def = toControls(makeDefaultState());
      for (const k in PARAMS) if (def[k] !== PARAMS[k].def) { problems.push('toControls: ' + k + ' ≠ default'); break; }
      const pr = FX.cathedralPad, back = toControls(applyPreset(makeDefaultState(), pr));
      for (const k in pr) if (back[k] !== pr[k]) { problems.push('applyPreset/toControls is not a round trip at ' + k); break; }
      const secs = 3.2, ctx = new OfflineAudioContext(2, Math.ceil(SR * secs), SR);
      // part 4 (the last to sound) has a short attack and the reverb send at
      // full: its tail is the only thing left at the end of the render
      const presets = [FX.pluckBass, FX.squareLead, FX.kick808, { ...FX.glassPad, a: 0.01, r: 0.15, reverbMix: 0.6 }];
      // reverbSize goes in at creation: regenerating the IR live is debounced (real timer: not deterministic offline)
      const sc = await createScene(ctx, presets, { roomS: { reverbSize: 2.6 } });
      sc.parts[1].engine.setMute(true);
      sc.parts[0].engine.set('bpm', 99);                       // from a part…
      sc.room.set('reverbPre', 0.02);                          // …and from the room
      if (!(sc.parts.every(p => p.engine.S.bpm === 99 && p.engine.S.reverbPre === 0.02 && p.engine.S.reverbSize === 2.6) && sc.S.bpm === 99))
        problems.push('the room is not shared (bpm / reverbPre / reverbSize do not reach every part)');
      const T = i => 0.1 + 0.6 * i;                            // each part plays C3 in its window
      sc.parts.forEach((p, i) => {
        ctx.suspend(T(i)).then(() => { p.engine.noteOn('n', NOTE1); ctx.resume(); });
        ctx.suspend(T(i) + 0.25).then(() => { p.engine.noteOff('n'); ctx.resume(); });
      });
      const buf = await ctx.startRendering();
      const a = analyze(buf);
      if (a.bad) problems.push('NaN/Inf');
      if (a.peak > 1) problems.push('clipping (' + dB(a.peak) + ')');
      const rmsW = (t0, t1) => { const d = buf.getChannelData(0), i0 = Math.floor(t0 * SR), i1 = Math.min(d.length, Math.floor(t1 * SR));
        let s = 0; for (let i = i0; i < i1; i++) s += d[i] * d[i]; return Math.sqrt(s / Math.max(1, i1 - i0)); };
      const lv = sc.parts.map((p, i) => rmsW(T(i) + 0.02, T(i) + 0.25));
      [0, 2, 3].forEach(i => { if (!(lv[i] > SILENCE)) problems.push('part ' + (i + 1) + ' does not sound (' + dB(lv[i]) + ')'); });
      if (!(lv[1] < SILENCE * 0.3)) problems.push('the muted part 2 sounds (' + dB(lv[1]) + ')');
      const tail = rmsW(2.75, 3.2);  // part 4: note 1.9-2.15 s, VCA closed at ~2.4 s (r 0.15) → only the shared reverb tail is left
      if (!(tail > 1e-3 * HR)) problems.push('no reverb tail from part 4 in the room (' + dB(tail) + ')');
      console.log('parts: levels', lv.map(v => dB(v)).join(' · '), '· tail', dB(tail), '· peak', dB(a.peak));
      r = { name: 'parts (state↔controls · scene of 4 · shared room · mute · tail)', peak: a.peak, ok: !problems.length, problems };
    } catch (e2) {
      r = { name: 'parts (state↔controls · scene of 4 · shared room · mute · tail)', peak: 0, ok: false,
            problems: ['exception: ' + ((e2 && e2.message) || e2)] };
    }
    push(r);
  }

  {
    // On-screen keyboard velocity (mouse): the HEIGHT of the press. (1) The
    // curve: 0.2 at the top, straight up to 85 % of the key length, then 1.
    // (2) Through the real path: a pointerdown at 10 % of a white key → the voice
    // is born with that velocity, the key publishes --vel (its brightness) and the Output
    // display shows it; at the very bottom → 1, as before there was velocity.
    const NAME = 'on-screen keyboard: velocity from the press height (curve · voice · key · display)';
    let r;
    try {
      const problems = [], near = (a, b) => Math.abs(a - b) < 1e-9, tk = getTouch();
      setTouch('linear');                          // the browser's touch curve does not count here
      if (!(near(velFromY(0), 0.2) && near(velFromY(0.425), 0.6) && near(velFromY(0.85), 1) && near(velFromY(1), 1) && near(velFromY(-0.1), 0.2)))
        problems.push('curve: ' + [0, 0.425, 0.85, 1].map(velFromY).map(v => v.toFixed(3)).join(' '));
      const keep = snapshot();
      loadState({});
      const key = document.querySelector('#keyboard .wkey'), midi = +key.dataset.midi, rc = key.getBoundingClientRect();
      const tap = f => {
        const opt = { bubbles: true, pointerId: 77, clientX: rc.left + rc.width / 2, clientY: rc.top + f * rc.height, buttons: 1 };
        key.dispatchEvent(new PointerEvent('pointerdown', opt));
        const v = part().voices.get('m' + midi), res = { vel: v ? v.vel : null, css: key.style.getPropertyValue('--vel'),
          disp: (document.getElementById('dispVal')?.textContent || '').trim() };
        key.dispatchEvent(new PointerEvent('pointerup', { ...opt, buttons: 0 }));
        return res;
      };
      const lo = tap(0.1), hi = tap(0.97), eLo = velFromY(0.1);
      if (!(rc.height > 20)) problems.push('keyboard without height (' + rc.height + ' px)');
      if (!(lo.vel !== null && Math.abs(lo.vel - eLo) < 0.02)) problems.push('top: the voice is born with vel ' + lo.vel + ' (expected ' + eLo.toFixed(2) + ')');
      if (!(hi.vel !== null && Math.abs(hi.vel - 1) < 1e-9)) problems.push('bottom: vel ' + hi.vel + ' (expected 1)');
      if (lo.css !== eLo.toFixed(2)) problems.push('the key does not publish --vel («' + lo.css + '»)');
      if (!lo.disp.includes(eLo.toFixed(2))) problems.push('the Output display does not show the velocity («' + lo.disp + '»)');
      part().allNotesOff();
      loadState(keep); setTouch(tk);
      r = { name: NAME, peak: 0, ok: !problems.length, problems };
    } catch (e2) { r = { name: NAME, peak: 0, ok: false, problems: ['exception: ' + ((e2 && e2.message) || e2)] }; }
    push(r);
  }

  {
    // Undo / redo / compare (Roadmap 7.0 · 1.1 and 1.2), through the real path:
    // (1) a GESTURE (press inside the screen → change → release → quiet) is one
    // step; (2) a change from code without a gesture (the drift) is NOT; (3) undo and
    // redo restore the value and do not cut the sounding note; (4) loading a preset
    // is a step; (5) ● and Compare: toggle saved ↔ edit, and touching something while
    // comparing goes back to the edit; (6) Ctrl+Z undoes and does not play a C.
    const NAME = 'undo · redo · compare (gestures yes, drift no; notes keep going; preset as a step; ● and Compare; Ctrl+Z)';
    let r;
    try {
      const problems = [], keep = snapshot(), wait = ms => new Promise(res => setTimeout(res, ms));
      const lab = CONTROLS.cutoff.el.querySelector('.lab'), lo = PARAMS.cutoff.def;
      const gesture = async fn => {
        lab.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, pointerId: 91, buttons: 1 }));
        fn();
        lab.dispatchEvent(new PointerEvent('pointerup', { bubbles: true, pointerId: 91 }));
        await wait(600);                                               // QUIET_MS closes the gesture
      };
      document.getElementById('resetBtn').click();                     // Reset as an action: saved = neutral
      const d0 = historyDepth().undo;
      await gesture(() => CONTROLS.cutoff.set(1234));
      if (historyDepth().undo !== d0 + 1) problems.push('a gesture does not leave a step (' + (historyDepth().undo - d0) + ')');
      if (!isModified()) problems.push('● does not light up after changing the cutoff');
      CONTROLS.reso.set(5); await wait(600);                           // like the drift: no gesture
      if (historyDepth().undo !== d0 + 1) problems.push('a change without a gesture (the drift) enters the history');
      CONTROLS.reso.set(PARAMS.reso.def);
      const e = part(); e.noteOn('hst', 220, 1);
      undo();
      if (Math.abs(CONTROLS.cutoff.get() - lo) > 1e-6) problems.push('undo does not restore the cutoff (' + CONTROLS.cutoff.get() + ')');
      if (!e.voices.has('hst')) problems.push('undo cuts the sounding note');
      redo();
      if (Math.abs(CONTROLS.cutoff.get() - 1234) > 1e-6) problems.push('redo does not go back to 1234');
      e.noteOff('hst');
      const ids = library.presets().map(it => it.id), d1 = historyDepth().undo;
      loadPresetId(ids.find(id => library.item(id).name !== 'Init'));
      if (historyDepth().undo !== d1 + 1) problems.push('loading a preset is not a step');
      undo();
      if (Math.abs(CONTROLS.cutoff.get() - 1234) > 1e-6) problems.push('undoing the load does not bring back the previous sound');
      document.getElementById('resetBtn').click();
      await gesture(() => CONTROLS.cutoff.set(1234));
      enterCompare();
      if (!isComparing() || Math.abs(CONTROLS.cutoff.get() - lo) > 1e-6) problems.push('Compare does not play the saved version');
      exitCompare();
      if (Math.abs(CONTROLS.cutoff.get() - 1234) > 1e-6) problems.push('leaving Compare does not bring back the edit');
      enterCompare();
      await gesture(() => {});                                         // touch something while comparing
      if (isComparing() || Math.abs(CONTROLS.cutoff.get() - 1234) > 1e-6) problems.push('touching while comparing does not go back to the edit');
      await gesture(() => CONTROLS.cutoff.set(lo));
      if (isModified()) problems.push('● stays lit with everything as saved');
      const before = CONTROLS.cutoff.get();
      window.dispatchEvent(new KeyboardEvent('keydown', { code: 'KeyZ', key: 'z', ctrlKey: true, bubbles: true, cancelable: true }));
      if (Math.abs(CONTROLS.cutoff.get() - before) < 1e-6) problems.push('Ctrl+Z does not undo');
      if ([...e.voices.keys()].some(k => /^m\d+$/.test(k))) problems.push('Ctrl+Z plays a note');
      window.dispatchEvent(new KeyboardEvent('keyup', { code: 'KeyZ', key: 'z', ctrlKey: true, bubbles: true }));
      e.allNotesOff();
      loadState(keep);
      r = { name: NAME, peak: 0, ok: !problems.length, problems };
    } catch (e2) { r = { name: NAME, peak: 0, ok: false, problems: ['exception: ' + ((e2 && e2.message) || e2)] }; }
    push(r);
  }

  {
    // Keyboard without stuck notes (Roadmap 7.0 · 0.1), through the real path (keyboard
    // and pointer events on the real keyboard): (1) Shift between press and release
    // — with the note filed by e.key, Shift+2 arrived as «"» and the note got stuck —;
    // (2) Ctrl+Z is a shortcut, not a C; (3) a touch CANCELED by the system releases;
    // (4) two fingers on the same key: it sounds until the last one is lifted.
    const NAME = 'keyboard without stuck notes (Shift between press and release · Ctrl+key does not play · canceled touch · two fingers)';
    let r;
    try {
      const problems = [], keep = snapshot();
      loadState({});
      const mv = () => [...part().voices.keys()].filter(k => /^m\d+$/.test(k)).length;
      const key = (type, code, k, mods = {}) => window.dispatchEvent(new KeyboardEvent(type, { code, key: k, bubbles: true, cancelable: true, ...mods }));
      key('keydown', 'Digit2', '2');
      if (mv() !== 1) problems.push('Digit2 does not play (voices ' + mv() + ')');
      key('keyup', 'Digit2', '"', { shiftKey: true });                 // Shift pressed in between: another «letter», the same key
      if (mv()) problems.push('Shift between press and release leaves the note stuck');
      key('keydown', 'KeyZ', 'z', { ctrlKey: true });
      if (mv()) problems.push('Ctrl+Z plays a note');
      key('keyup', 'KeyZ', 'z', { ctrlKey: true });
      const el = document.querySelector('#keyboard .wkey'), rc = el.getBoundingClientRect();
      const ptr = (type, id) => el.dispatchEvent(new PointerEvent(type, { bubbles: true, pointerId: id, clientX: rc.left + rc.width / 2, clientY: rc.bottom - 4, buttons: type === 'pointerdown' ? 1 : 0 }));
      ptr('pointerdown', 81);
      if (mv() !== 1) problems.push('the pointer does not play');
      ptr('pointercancel', 81);
      if (mv()) problems.push('a canceled touch leaves the note stuck');
      ptr('pointerdown', 82); ptr('pointerdown', 83);
      ptr('pointerup', 82);
      if (mv() !== 1) problems.push('two fingers: lifting the first cuts the second one\'s note');
      ptr('pointerup', 83);
      if (mv()) problems.push('two fingers: after lifting both it keeps sounding');
      part().allNotesOff();
      loadState(keep);
      r = { name: NAME, peak: 0, ok: !problems.length, problems };
    } catch (e2) { r = { name: NAME, peak: 0, ok: false, problems: ['exception: ' + ((e2 && e2.message) || e2)] }; }
    push(r);
  }

  {
    // Keyboard: (1) the QWERTY has its own octave and reaches the very top. It used to
    // share the view's, which with 6 octaves on screen stops at C3–C9, and the P
    // (two octaves and a third above the Z) stayed at E5. Now the Z goes from C0 to
    // C7 (the I gives C9) and the view scrolls to show it. (2) Glissando: with the
    // button held, moving to another key plays it and releases the previous one; on lifting, nothing
    // sounds. Through the real path: − / + buttons, keyboard and pointer events.
    const NAME = 'keyboard: the QWERTY reaches C9 · glissando with the mouse';
    let r;
    try {
      const problems = [], keep = snapshot();
      loadState({});
      const num = () => document.getElementById('kbOctNum').textContent;
      const btn = d => document.querySelector('#kbOct button[data-kbo="' + d + '"]');
      const on = m => !!document.querySelector('#keyboard [data-midi="' + m + '"].on');
      const zAt = () => +[...document.querySelectorAll('#keyboard .klab')].find(e => e.textContent === 'Z')?.closest('[data-midi]')?.dataset.midi;
      const key = (type, code, k) => window.dispatchEvent(new KeyboardEvent(type, { code, key: k, bubbles: true, cancelable: true }));
      const start = num();
      if (start !== 'C3–E5') problems.push('initial octave: ' + start + ' (expected C3–E5: the Q on middle C)');
      for (let k = 0; k < 10; k++) btn(1).click();
      if (num() !== 'C7–E9') problems.push('at the very top: ' + num());
      if (zAt() !== 96) problems.push('the Z is not on C7 (' + zAt() + ')');
      key('keydown', 'KeyI', 'i');
      if (!part().voices.has('m120') || !on(120)) problems.push('the I does not play C9 (or it is not visible)');
      key('keyup', 'KeyI', 'i');
      for (let k = 0; k < 10; k++) btn(-1).click();
      if (num() !== 'C0–E2' || zAt() !== 12) problems.push('at the very bottom: ' + num() + ', Z on ' + zAt());
      for (let k = 0; k < 10 && num() !== start; k++) btn(1).click();
      // glissando: the first two white keys (on the left: the selftest panel is on the right)
      const [a, b] = document.querySelectorAll('#keyboard .wkey');
      const sc = document.body, sx = sc.scrollLeft, sy = sc.scrollTop;   // with a small window (the runner) the instrument scrolls: make them visible
      if (b.getBoundingClientRect().bottom > innerHeight) b.scrollIntoView({ block: 'end', inline: 'nearest' });
      const ra = a.getBoundingClientRect(), rb = b.getBoundingClientRect(), ma = +a.dataset.midi, mb = +b.dataset.midi;
      const y = ra.bottom - 6, kb = document.getElementById('keyboard');
      const ptr = (type, el, x, buttons) => el.dispatchEvent(new PointerEvent(type, { bubbles: true, pointerId: 91, clientX: x, clientY: y, buttons }));
      const hit = document.elementFromPoint(rb.left + rb.width / 2, y);
      if (hit?.closest('[data-midi]') !== b) problems.push('(cannot aim at the second key: at ' + Math.round(rb.left + rb.width / 2) + ',' + Math.round(y) + ' there is ' + (hit ? hit.tagName + '#' + hit.id + '.' + hit.className : 'nothing') + ' · window ' + innerWidth + '×' + innerHeight + ')');
      else {
        ptr('pointerdown', a, ra.left + ra.width / 2, 1);
        const s1 = part().voices.has('m' + ma);
        ptr('pointermove', kb, rb.left + rb.width / 2, 1);
        const s2 = part().voices.has('m' + mb) && !on(ma) && on(mb);
        ptr('pointermove', kb, ra.left + ra.width / 2, 0);            // no button: passing over does not play
        const s3 = on(mb) && !on(ma);
        ptr('pointerup', kb, rb.left + rb.width / 2, 0);
        const s4 = !on(ma) && !on(mb);
        if (!s1) problems.push('pressing does not play');
        if (!s2) problems.push('dragging to the next key does not play it (or does not release the first)');
        if (!s3) problems.push('with no button held, passing over changes the note');
        if (!s4) problems.push('after lifting a key stays lit');
      }
      sc.scrollLeft = sx; sc.scrollTop = sy;
      part().allNotesOff();
      loadState(keep);
      r = { name: NAME, peak: 0, ok: !problems.length, problems };
    } catch (e2) { r = { name: NAME, peak: 0, ok: false, problems: ['exception: ' + ((e2 && e2.message) || e2)] }; }
    push(r);
  }

  {
    // Quick preset selector (ui/presetPicker.js), through the real path (clicks and
    // keys): it opens with the search box focused; search ignores accents and case;
    // a category leaves only its own and the counters say how many match in
    // each one; ↓ loads the next of the filtered list; Enter closes; after a click on the
    // list (the focus leaves the search box) the keyboard plays and Esc closes WITHOUT panic; and
    // «Browse all» takes you to the Presets screen with the same search.
    const NAME = 'preset selector (accent-insensitive search · categories · ↓ loads · Esc without panic · Browse all)';
    let r;
    try {
      const problems = [], keep = snapshot(), id0 = currentPresetId(), scr0 = currentScreen();
      const $ = id => document.getElementById(id);
      const pop = $('presetPop'), search = $('ppSearch');
      const type = t => { search.value = t; search.dispatchEvent(new Event('input')); };
      const ids = () => [...document.querySelectorAll('#ppList .pp-item')].map(e => e.dataset.id);
      const mv = () => [...part().voices.keys()].filter(k => /^m\d+$/.test(k)).length;
      $('presetPick').click();
      if (pop.hidden || document.activeElement !== search) problems.push('it does not open with the search box focused');
      // a preset searched in upper case (and without accents, if any has them; the factory no longer does)
      const accented = library.presets().find(it => /[áéíóúñ]/i.test(it.name)) || library.presets().find(it => it.name.length > 8);
      if (accented) {
        const plain = accented.name.normalize('NFD').replace(/[̀-ͯ]/g, '').toUpperCase();
        type(plain);
        if (!ids().includes(accented.id)) problems.push('«' + plain + '» does not find «' + accented.name + '»');
        type('');
      }
      // category: only its own, and its counter = what is visible
      const catEls = [...document.querySelectorAll('#ppCats .pp-cat')];
      const sec = library.sections().find(x => library.items(x.id).filter(it => it.type === 'preset').length > 3);
      const catEl = catEls.find(c => c.querySelector('.pp-cname').textContent === sec.name);
      if (catEls[0]?.querySelector('.pp-cname').textContent !== 'All' || +catEls[0].querySelector('.pp-cn').textContent !== library.presets().length)
        problems.push('«All» does not count the whole library');
      if (!catEl) problems.push('the category «' + sec.name + '» is missing');
      else {
        catEl.click();
        const v = ids();
        if (!v.length || v.some(id => library.item(id).section !== sec.id)) problems.push('«' + sec.name + '» shows presets from other sections');
        const cnt = +document.querySelector('#ppCats .pp-cat.on .pp-cn')?.textContent;
        if (cnt !== v.length) problems.push('counter ' + cnt + ' ≠ ' + v.length + ' visible');
        // click loads; ↓ from there loads the next one
        document.querySelector('#ppList .pp-item').click();
        if (currentPresetId() !== v[0]) problems.push('click does not load');
        window.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown', code: 'ArrowDown', bubbles: true, cancelable: true }));
        if (currentPresetId() !== v[1]) problems.push('↓ does not load the next one');
        // the focus is no longer on the search box: the keyboard plays and Esc closes without cutting the note
        if (document.activeElement === search) search.blur();   // (in the browser the real click does it)
        window.dispatchEvent(new KeyboardEvent('keydown', { code: 'KeyZ', key: 'z', bubbles: true, cancelable: true }));
        const playing = part().voices.size;   // all held voices: the loaded preset may be mono (its voice is «mono», not «m1»)
        window.dispatchEvent(new KeyboardEvent('keydown', { code: 'Escape', key: 'Escape', bubbles: true, cancelable: true }));
        if (!playing) problems.push('outside the search box the keyboard does not play');
        if (!pop.hidden) problems.push('Esc does not close');
        if (playing && part().voices.size !== playing) problems.push('Esc with the selector open triggers panic');
        window.dispatchEvent(new KeyboardEvent('keyup', { code: 'KeyZ', key: 'z', bubbles: true }));
        // reopen: it remembers the category; Enter closes
        $('presetPick').click();
        if (!document.querySelector('#ppCats .pp-cat.on .pp-cname')?.textContent.startsWith(sec.name)) problems.push('it does not remember the category');
        window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', code: 'Enter', bubbles: true, cancelable: true }));
        if (!pop.hidden) problems.push('Enter does not close');
      }
      // Browse all: to the Presets screen with the search
      $('presetPick').click(); document.querySelector('#ppCats .pp-cat').click();
      type('pad');
      $('ppAll').click();
      if (currentScreen() !== 'presets') problems.push('«Browse all» does not go to Presets');
      if ($('libSearch').value !== 'pad') problems.push('the search does not travel («' + $('libSearch').value + '»)');
      if (!pop.hidden) problems.push('«Browse all» does not close the selector');
      $('libSearch').value = ''; $('libSearch').dispatchEvent(new Event('input'));
      showScreen(scr0);
      part().allNotesOff();
      if (id0) loadPresetId(id0);
      loadState(keep);
      r = { name: NAME, peak: 0, ok: !problems.length, problems };
    } catch (e2) { r = { name: NAME, peak: 0, ok: false, problems: ['exception: ' + ((e2 && e2.message) || e2)] }; }
    push(r);
  }

  {
    // Keyboard ↔ parts (caught by the user, 2026-10-01: «I switch parts
    // while playing and the audio gets corrupted»): the keyboard's note-off went to the
    // CURRENT part, not to the one that received the note-on → stuck note in the other
    // part (a voice taken forever; in mono, the player slid in
    // legato over it). (1) NoteRouter: the off reaches the engine that sounded even if
    // the «current» one is another; (2) Layer: on in several, off in the same ones; (3) a
    // foreign id does not stop the latched Seq; (4) nor re-glides someone else's mono voice.
    // No render: the voices of each engine are inspected (offline, no tail timers).
    const NAME = 'keyboard ↔ parts (note-off to the part that sounded · Layer · foreign ids: latched Seq carries on, mono does not slide)';
    let r;
    try {
      const problems = [];
      const ctx = new OfflineAudioContext(2, SR, SR);
      const sc = await createScene(ctx, [{}, {}, { seqOn: 'on', seqLatch: 'on' }, { mode: 'mono', glide: 0.3 }]);
      const [A, B, C, D] = sc.parts.map(p => p.engine);
      const router = new NoteRouter();
      // (1) note-on in A, «part switch» to B, note-off: A releases, B does not even notice
      router.on('m60', [A], NOTE1);
      if (!A.voices.has('m60')) problems.push('the note does not reach part A');
      router.off('m60', [B]);
      if (A.voices.has('m60') || A.tails.size !== 1) problems.push('the note-off does not reach the part that sounded (A is still held)');
      if (B.voices.size || B.tails.size) problems.push('the note-off plays on the current part instead of the one that sounded');
      // (2) Layer: on in A and B, off in the same ones even if the «current» one is C
      router.on('m62', [A, B], NOTE1);
      router.off('m62', [C]);
      if (A.voices.has('m62') || B.voices.has('m62') || C.voices.size) problems.push('Layer: the note-off does not go back to the same parts');
      // (3) latched Seq: releasing the root leaves the phrase latched; a foreign id does not stop it
      C.noteOn('k', NOTE1); C.noteOff('k');
      if (!C.seq.latched) problems.push('Seq: the latch does not hold the phrase when the root is released');
      C.noteOff('ajeno');
      if (!C.seq.latched || !C.seq.timer) problems.push('Seq: a foreign note-off stops the latched phrase');
      C.allNotesOff();
      if (C.seq.latched || C.seq.timer) problems.push('Seq: allNotesOff does not clear the latch');
      // (4) mono: a foreign id neither re-glides the voice (glideTo) nor releases it
      D.noteOn('p', NOTE1); D.noteOn('q', NOTE2);
      let glides = 0; const v = D.monoVoice; const g0 = v.glideTo.bind(v); v.glideTo = (...a) => { glides++; g0(...a); };
      D.noteOff('ajeno');
      if (glides || D.monoVoice !== v || D.heldStack.length !== 2) problems.push('mono: a foreign note-off re-glides or releases the voice');
      D.noteOff('q');
      if (glides !== 1 || D.heldStack.length !== 1) problems.push('mono: releasing the upper one does not go back to the lower one');
      D.allNotesOff();
      r = { name: NAME, peak: 0, ok: !problems.length, problems };
    } catch (e2) {
      r = { name: NAME, peak: 0, ok: false, problems: ['exception: ' + ((e2 && e2.message) || e2)] };
    }
    push(r);
  }

  {
    // Harmony + players (Roadmap 4.0 · C2): (1) harmony — quantization to the
    // scale (ties go down), chords stacked in thirds on the scale, a deterministic
    // walk through functions with the seed (and different with another); (2)
    // Euclidean — E(3,8) is the tresillo and E(k,n) has k hits in any
    // rotation; (3) offline scene with 4 players (pulse, melody, chord,
    // root) over 4 parts, 2 bars at 120: ALL the emitted notes are
    // in the scale, the pulse emits k per bar, the chord `notes` per change,
    // the root 2 per bar (with fifth), with no NaN or clipping and audible; (4)
    // determinism — two conductors with the same seed emit exactly
    // the same events; with another seed, different ones.
    body.appendChild(el('st-cat', 'Harmony and players'));
    let r;
    try {
      const problems = [];
      const h = new Harmony({ root: 0, scale: 'major', prog: [1, 6, 4, 5], bars: 1, seed: 3 });
      const q = [h.quantize(61), h.quantize(66), h.quantize(62)];
      if (q.join() !== '60,65,62') problems.push('quantization: ' + q.join());
      const tri = b => h.chordAt(b).tones.slice(0, 3).join('.');
      if (tri(0) !== '0.4.7' || tri(1) !== '9.0.4' || tri(3) !== '7.11.2') problems.push('chords: ' + [tri(0), tri(1), tri(3)].join(' | '));
      const walk = seed => { const hf = new Harmony({ mode: 'functions', seed }); return [...Array(16)].map((_, i) => hf.degreeAt(i)); };
      const w = walk(5), w2 = walk(5), w3 = walk(6);
      if (w.join() !== w2.join()) problems.push('functions walk not deterministic');
      if (w.join() === w3.join()) problems.push('functions walk the same with another seed');
      if (!w.every(d => d >= 1 && d <= 7)) problems.push('degree outside 1..7');
      const e38 = euclid(3, 8).join('');
      if (e38 !== '10010010') problems.push('E(3,8) = ' + e38);
      for (const [k, n] of [[5, 8], [7, 16], [4, 16], [9, 12]]) for (let rot = 0; rot < n; rot += 3) {
        const s = euclid(k, n, rot).reduce((a, b) => a + b, 0);
        if (s !== k) { problems.push('E(' + k + ',' + n + ') rot ' + rot + ': ' + s + ' hits'); break; }
      }
      const secs = 4.0, ctx = new OfflineAudioContext(2, Math.ceil(SR * secs), SR);
      const presets = [FX.kick808, FX.squareLead, { ...FX.glassPad, a: 0.01, r: 0.2 }, FX.pluckBass];
      const sc = await createScene(ctx, presets, { roomS: { bpm: 120 } });
      const setup = cd => {
        Object.assign(cd.harmony, { root: 2, scale: 'minor', prog: [1, 6, 4, 5], bars: 1, mode: 'list' });
        const [p1, p2, p3, p4] = cd.players;
        p1.setMode('pulse');   Object.assign(p1.cfg, { k: 4, n: 16, prob: 1 });
        p2.setMode('melody'); Object.assign(p2.cfg, { density: 0.7, rest: 0.1 });
        p3.setMode('chord');  Object.assign(p3.cfg, { notes: 3 });
        p4.setMode('root');    Object.assign(p4.cfg, { every: 1, fifth: 1 });
        Object.assign(cd.arr.cfg, { energy: 1, sway: 0, surprise: 0, open: 0 });   // neutral arrangement: the players are what is tested here
        cd.players.forEach(p => { p.log = []; });
      };
      const logs = cd => JSON.stringify(cd.players.map(p => p.log));
      const cdA = new Conductor(sc, { seed: 11 }), cdB = new Conductor(sc, { seed: 11 }), cdC = new Conductor(sc, { seed: 12 });
      for (const cd of [cdA, cdB, cdC]) { cd.dry = true; setup(cd); cd.scheduleAll(secs); }
      if (logs(cdA) !== logs(cdB)) problems.push('players not deterministic with the same seed');
      if (logs(cdA) === logs(cdC)) problems.push('players identical with another seed');
      const cd = sc.conductor; cd.setSeed(11); setup(cd); cd.scheduleAll(secs);
      const buf = await ctx.startRendering();
      const a = analyze(buf);
      if (a.bad) problems.push('NaN/Inf');
      if (a.peak > 1) problems.push('clipping (' + dB(a.peak) + ')');
      if (a.peak <= SILENCE) problems.push('silence');
      const scale = cd.harmony.scaleSet();
      const ons = cd.players.map(p => p.log.filter(e => e[1] === 'on'));
      const outside = ons.flat().filter(e => !scale.has(((e[2] % 12) + 12) % 12)).length;
      if (outside) problems.push(outside + ' notes outside the scale');
      if (ons[0].length !== 8) problems.push('pulse: ' + ons[0].length + ' hits (expected 4 × 2 bars)');
      if (ons[2].length !== 6) problems.push('chord: ' + ons[2].length + ' notes (expected 3 × 2 chords)');
      if (ons[3].length !== 4) problems.push('root: ' + ons[3].length + ' notes (expected 2 × 2 bars)');
      if (!(ons[1].length >= 4)) problems.push('melody: only ' + ons[1].length + ' notes');
      const grid = ons[0].every(e => Math.abs(e[0] / 0.125 - Math.round(e[0] / 0.125)) < 1e-3);
      if (!grid) problems.push('pulse off the sixteenth-note grid');
      console.log('players: notes', ons.map(o => o.length).join('/'), '· outside the scale', outside, '· peak', dB(a.peak), '· walk', w.join(' '));
      r = { name: 'harmony and players (scale · chords · Euclidean · offline scene · determinism)', peak: a.peak, ok: !problems.length, problems };
    } catch (e2) {
      r = { name: 'harmony and players (scale · chords · Euclidean · offline scene · determinism)', peak: 0, ok: false,
            problems: ['exception: ' + ((e2 && e2.message) || e2)] };
    }
    push(r);
  }

  {
    // Arrangement and scenes (Roadmap 4.0 · C3): (1) energy: bounded, starts at
    // energy − sway/2 and peaks halfway through the cycle; a part with a high
    // threshold is silent at the start and comes in at the peak; the surprise is
    // deterministic; (2) scene JSON: export → alter → import gives back
    // exactly what was exported (room, conductor, parts); (3) same seed
    // ⇒ same SAMPLES: two offline renders of the same scene (the randomness of the
    // offline engine is seeded, Roadmap 7.0 · 7.1) match
    // down to the LAST BIT (WebAudio sums a node's inputs in an order
    // that depends on memory addresses: differences ~1e-7, −140 dB), and
    // with another seed they really differ; (4) the repo's demo scene
    // loads and sounds.
    body.appendChild(el('st-cat', 'Arrangement and scenes'));
    let r;
    try {
      const problems = [];
      const fake = { seed: 3 }, arr = new Arrangement(fake);
      Object.assign(arr.cfg, { energy: 0.6, sway: 0.6, cycle: 16, surprise: 0 });
      const E0 = arr.energyAt(0), E8 = arr.energyAt(8), Emax = Math.max(...[...Array(64)].map((_, b) => arr.energyAt(b))), Emin = Math.min(...[...Array(64)].map((_, b) => arr.energyAt(b)));
      if (!(Math.abs(E0 - 0.3) < 1e-9 && Math.abs(E8 - 0.9) < 1e-9)) problems.push('energy: E(0)=' + E0.toFixed(3) + ' E(8)=' + E8.toFixed(3));
      if (Emin < 0 || Emax > 1) problems.push('energy outside [0,1]');
      const pc = { threshold: 0.85 };
      if (arr.stateAt(0, 0, pc).active || !arr.stateAt(8, 0, pc).active) problems.push('threshold: the part does not go quiet/come in where it should');
      arr.cfg.surprise = 1;
      const rests = [...Array(40)].map((_, b) => arr.rest(b, 1)), rests2 = [...Array(40)].map((_, b) => arr.rest(b, 1));
      const nRest = rests.filter(Boolean).length;
      if (rests.join() !== rests2.join()) problems.push('surprise not deterministic');
      if (!(nRest >= 3 && nRest <= 20)) problems.push('surprise: ' + nRest + ' rests out of 40 (expected ~10)');
      // (2)-(4): offline scene
      const presets = [FX.kick808, FX.squareLead, { ...FX.glassPad, a: 0.01, r: 0.2 }, FX.pluckBass];
      const conf = cd => {
        Object.assign(cd.harmony, { root: 4, scale: 'dorian', prog: [1, 4], bars: 1, mode: 'list' });
        Object.assign(cd.arr.cfg, { energy: 0.6, sway: 0.6, cycle: 2, open: 1, surprise: 0.3 });
        const [p1, p2, p3, p4] = cd.players;
        p1.setMode('pulse');   Object.assign(p1.cfg, { k: 4, n: 16, threshold: 0.4 });
        p2.setMode('melody'); Object.assign(p2.cfg, { density: 0.7, rest: 0.1 });
        p3.setMode('chord');  Object.assign(p3.cfg, { notes: 3, threshold: 0.2 });
        p4.setMode('root');    Object.assign(p4.cfg, { every: 1, fifth: 1 });
      };
      const secs = 4.0;
      const render = async seed => {
        const ctx = new OfflineAudioContext(2, Math.ceil(SR * secs), SR);
        const sc = await createScene(ctx, presets, { roomS: { bpm: 120 } });
        conf(sc.conductor); sc.conductor.setSeed(seed); sc.conductor.scheduleAll(secs);
        return { sc, buf: await ctx.startRendering() };
      };
      const A = await render(11), B = await render(11), C = await render(12);
      const aA = analyze(A.buf);
      if (aA.bad) problems.push('NaN/Inf'); if (aA.peak > 1) problems.push('clipping'); if (aA.peak <= SILENCE) problems.push('silence');
      const cmp = (x, y) => { const a = x.getChannelData(0), b = y.getChannelData(0); let n = 0, mx = 0; for (let i = 0; i < a.length; i++) { const d = Math.abs(a[i] - b[i]); if (d > 0) { n++; if (d > mx) mx = d; } } return { n, mx }; };
      const dAB = cmp(A.buf, B.buf), dAC = cmp(A.buf, C.buf);
      if (!(dAB.mx < 1e-5)) problems.push('same seed, different renders (' + dAB.n + ' samples, max ' + dAB.mx.toExponential(2) + ')');
      if (!(dAC.mx > 1e-3)) problems.push('another seed, identical render (max ' + dAC.mx.toExponential(2) + ')');
      // macro: with Open 1 the energy moves the filters' detune
      const cents0 = A.sc.conductor.arr.macroCents(0), cents1 = A.sc.conductor.arr.macroCents(1);
      if (!(cents0 < -400 && cents1 > 500)) problems.push('Open macro: ' + cents0.toFixed(0) + ' / ' + cents1.toFixed(0) + ' ct');   // E 0.3 → −480 · E 0.9 → +960
      // JSON round trip on scene A
      const sc = A.sc, strip = j => { const o = JSON.parse(JSON.stringify(j)); delete o.date; return JSON.stringify(o); };
      sc.parts[1].pan = -0.4; sc.parts[3].mute = true; sc.roomCfg.fb = 0.61;
      const J1 = sceneToJSON(sc);
      sc.conductor.setSeed(1); Object.assign(sc.conductor.harmony, { root: 0, scale: 'major', prog: [1], bars: 2 });
      Object.assign(sc.conductor.arr.cfg, { energy: 0.1, cycle: 8 }); sc.conductor.players.forEach(p => { p.cfg.mode = 'off'; p.cfg.threshold = 0; });
      sc.parts[1].pan = 0; sc.parts[3].mute = false; sc.roomCfg.fb = 0.2; sc.S.reverbSize = 1.0;
      sc.parts[0].engine.set('cutoff', 555);
      const J2 = sceneToJSON(sc);
      if (strip(J1) === strip(J2)) problems.push('altering the scene does not change its JSON');
      applySceneJSON(sc, JSON.parse(JSON.stringify(J1)));
      const J3 = sceneToJSON(sc);
      if (strip(J3) !== strip(J1)) problems.push('scene JSON: the round trip is not exact');
      if (sc.parts[0].engine.S.cutoff !== J1.parts[0].state.cutoff) problems.push('import does not restore the part state');
      // (4) the repo scenes (scenes/*.json): they load, their presets are
      // applied, they sound with no NaN or clipping and everything emitted is in their scale
      const SCENE_FILES = ['night-ambient', 'dorian-dawn', 'hypnotic-techno', 'robot-choir'];
      const peaks = [];
      for (const sceneName of SCENE_FILES) {
        const j = await (await fetch('scenes/' + sceneName + '.json', { cache: 'no-store' })).json();
        const ctxD = new OfflineAudioContext(2, Math.ceil(SR * 4), SR);
        const scD = await createScene(ctxD, []);
        applySceneJSON(scD, j);
        scD.conductor.players.forEach(p => { p.log = []; });
        scD.conductor.scheduleAll(4);
        const aD = analyze(await ctxD.startRendering());
        peaks.push(sceneName + ' ' + dB(aD.peak));
        if (aD.bad) problems.push(sceneName + ': NaN/Inf'); if (aD.peak > 1) problems.push(sceneName + ': clipping'); if (aD.peak <= SILENCE) problems.push(sceneName + ' silent (' + dB(aD.peak) + ')');
        if (scD.parts.map(p => p.presetName).join('|') !== j.parts.map(p => p.preset).join('|')) problems.push(sceneName + ': preset names not applied');
        const scaleSet = scD.conductor.harmony.scaleSet(), ons = scD.conductor.players.flatMap(p => p.log.filter(x => x[1] === 'on'));
        if (!ons.length) problems.push(sceneName + ': no player emits');
        if (ons.some(x => !scaleSet.has(((x[2] % 12) + 12) % 12))) problems.push(sceneName + ': notes outside the scale');
      }
      console.log('scenes: E(0)', E0.toFixed(2), 'E(8)', E8.toFixed(2), '· surprises', nRest + '/40', '· A=B max', dAB.mx.toExponential(1), '· A≠C max', dAC.mx.toExponential(1), '· macro', cents0.toFixed(0) + '/' + cents1.toFixed(0), 'ct · peaks', peaks.join(' · '));
      r = { name: 'arrangement and scenes (energy · threshold · surprise · JSON round trip · same seed = same samples · demo)', peak: aA.peak, ok: !problems.length, problems };
    } catch (e2) {
      r = { name: 'arrangement and scenes (energy · threshold · surprise · JSON round trip · same seed = same samples · demo)', peak: 0, ok: false,
            problems: ['exception: ' + ((e2 && e2.message) || e2)] };
    }
    push(r);
  }

  {
    // Seeded randomness in offline renders (Roadmap 7.0 · 7.1): a state
    // with ALL the engine's randomness — free phases of the FM modulator and the unison,
    // supersaw, worklet drift, noise, reverb IR, Life and Bite of the
    // Vocal, S&H per note — rendered twice gives the same samples (except
    // for WebAudio's summing order, ~1e-7); with another seed (seedRender)
    // it sounds different; and outside an offline render the randomness is Math.random.
    body.appendChild(el('st-cat', 'Seeded randomness'));
    const NAME = 'seeded offline randomness (two renders = same samples · another seed ≠ · live Math.random)';
    let r;
    try {
      const problems = [];
      loadState({ waveA: 'sine', fmIndex: 3, fmRatio: 2, uniVoices: '3', drift: 8, waveB: 'supersaw', levelB: 0.5,
                  noise: 0.3, reverbMix: 0.3, vocAmt: 0.6, vocLife: 0.5, vocAtk: 0.8, mx1src: 'rnd', mx1dst: 'cutoff', mx1amt: 0.5 });
      const S = structuredClone(engine.S);
      const render = async seed => {
        const ctx = new OfflineAudioContext(2, Math.ceil(SR * 1.2), SR);
        if (seed !== undefined) seedRender(ctx, seed);
        const eng = new AudioEngine(); eng.S = structuredClone(S);
        await eng.init(ctx);
        eng.noteOn('t1', NOTE1, 1); eng.noteOn('t2', NOTE2, 0.8);
        ctx.suspend(0.6).then(() => { eng.noteOff('t1'); eng.noteOff('t2'); ctx.resume(); });
        return ctx.startRendering();
      };
      const A = await render(), B = await render(), C = await render(12345);
      const cmp = (x, y) => { let mx = 0; for (let ch = 0; ch < 2; ch++) { const a = x.getChannelData(ch), b = y.getChannelData(ch); for (let i = 0; i < a.length; i++) { const d = Math.abs(a[i] - b[i]); if (d > mx) mx = d; } } return mx; };
      const aA = analyze(A), dAB = cmp(A, B), dAC = cmp(A, C);
      if (aA.bad) problems.push('NaN/Inf'); if (aA.peak <= SILENCE) problems.push('silence');
      if (!(dAB < 1e-5)) problems.push('same seed, different renders (max ' + dAB.toExponential(2) + ')');
      if (!(dAC > 1e-2)) problems.push('another seed, identical render (max ' + dAC.toExponential(2) + ')');
      if (ctxRandom({}) !== Math.random) problems.push('outside an offline render the randomness is not Math.random');
      console.log('seeded randomness: A=B max', dAB.toExponential(1), '· A≠C max', dAC.toExponential(1));
      r = { name: NAME, peak: aA.peak, ok: !problems.length, problems };
    } catch (e2) {
      r = { name: NAME, peak: 0, ok: false, problems: ['exception: ' + ((e2 && e2.message) || e2)] };
    }
    push(r);
  }

  {
    // Plate reverb (Roadmap 4.0 · A2): impulse response of a Room in
    // «plate» mode: (1) no NaN, bounded peak; (2) the tail DECAYS
    // monotonically (RMS over 250 ms windows) and is still alive at 1.5 s with Size 3;
    // (3) Size 0.5 leaves much less tail than Size 3 (the RT60 follows the knob);
    // (4) L and R decorrelated (|corr| < 0.6 between 0.2 and 1.2 s: two sets of
    // taps from the same tank); (5) the DENSITY grows — between 100 and 120 ms
    // there are more «live» samples than in the first 20 ms (the allpasses
    // multiply the reflections: something a noise IR does not do); (6) a
    // preset in «plate» sounds different than in «hall» (the switch exists).
    body.appendChild(el('st-cat', 'Plate reverb'));
    let r;
    try {
      const problems = [];
      const ir = async (size, damp = 0.3) => {
        const ctx = new OfflineAudioContext(2, Math.ceil(SR * 2.5), SR);
        await loadWorklets(ctx);
        const S = makeDefaultState(); Object.assign(S, { reverbType: 'plate', reverbSize: size, reverbDamp: damp, reverbPre: 0 });
        const room = new Room(ctx, S, { master: 1 });
        const b = ctx.createBuffer(1, 8, SR); b.getChannelData(0)[0] = 1;
        const src = ctx.createBufferSource(); src.buffer = b; src.connect(room.revIn); src.start(0);
        return ctx.startRendering();
      };
      const big = await ir(3), small = await ir(0.5);
      const a = analyze(big);
      if (a.bad) problems.push('NaN/Inf');
      if (a.peak > 1.5) problems.push('excessive peak (' + dB(a.peak) + ')');
      if (a.peak <= SILENCE) problems.push('the plate does not respond to the impulse');
      const rmsW = (buf, ch, t0, t1) => { const d = buf.getChannelData(ch), i0 = Math.floor(t0 * SR), i1 = Math.min(d.length, Math.floor(t1 * SR));
        let s = 0; for (let i = i0; i < i1; i++) s += d[i] * d[i]; return Math.sqrt(s / Math.max(1, i1 - i0)); };
      const env = [...Array(9)].map((_, i) => rmsW(big, 0, 0.25 * i + 0.25, 0.25 * i + 0.5));   // 0.25 … 2.5 s
      for (let i = 1; i < env.length; i++) if (env[i] > env[i - 1] * 1.1) { problems.push('the tail does not decay (window ' + i + ': ' + dB(env[i]) + ' after ' + dB(env[i - 1]) + ')'); break; }
      if (!(env[3] > 1e-4 * HR)) problems.push('Size 3: tail dead at 1 s (' + dB(env[3]) + ')');
      const tailS = rmsW(small, 0, 1.0, 1.25);
      if (!(env[3] > 5 * tailS)) problems.push('Size does not govern the RT (' + dB(env[3]) + ' vs ' + dB(tailS) + ')');
      let corr = 0;
      { const L = big.getChannelData(0), R = big.getChannelData(1), i0 = Math.floor(0.2 * SR), i1 = Math.floor(1.2 * SR);
        let sl = 0, sr = 0, sx = 0; for (let i = i0; i < i1; i++) { sl += L[i] * L[i]; sr += R[i] * R[i]; sx += L[i] * R[i]; }
        corr = sx / Math.max(1e-12, Math.sqrt(sl * sr));
        if (!(Math.abs(corr) < 0.6)) problems.push('L/R too similar (corr ' + corr.toFixed(2) + ')'); }
      let early = 0, late = 0;
      { const d = big.getChannelData(0), thr = a.peak * 0.01;
        const alive = (t0, t1) => { let n = 0; for (let i = Math.floor(t0 * SR); i < Math.floor(t1 * SR); i++) if (Math.abs(d[i]) > thr) n++; return n; };
        early = alive(0.001, 0.021); late = alive(0.1, 0.12);
        if (!(late > early)) problems.push('the density does not grow (' + early + ' → ' + late + ' live samples)'); }
      loadState({ ...FX.platePad, reverbType: 'hall' });
      const bHall = await renderBuf(structuredClone(engine.S));
      loadState(FX.platePad);
      const bPlate = await renderBuf(structuredClone(engine.S));
      const diff = (x, y) => { const cX = x.getChannelData(0), cY = y.getChannelData(0); let d = 0, en = 0;
        for (let i = 0; i < cX.length; i += 16) { const e = cX[i] - cY[i]; d += e * e; en += cX[i] * cX[i]; } return Math.sqrt(d / Math.max(1e-12, en)); };
      const dd = diff(bHall, bPlate);
      if (!(dd > 0.2)) problems.push('hall vs plate barely differ (' + dd.toFixed(3) + ')');
      console.log('plate: tail', env.map(v => dB(v)).join(' '), '· size 0.5 @1 s', dB(tailS), '· corr L/R', corr.toFixed(2), '· density', early + '→' + late, '· diff hall/plate', dd.toFixed(3), '· peak', dB(a.peak));
      r = { name: 'plate reverb (impulse decays · RT follows Size · L/R decorrelated · density grows · hall ≠ plate)', peak: a.peak, ok: !problems.length, problems };
    } catch (e2) {
      r = { name: 'plate reverb (impulse decays · RT follows Size · L/R decorrelated · density grows · hall ≠ plate)', peak: 0, ok: false,
            problems: ['exception: ' + ((e2 && e2.message) || e2)] };
    }
    push(r);
  }

  {
    // FM4 (Roadmap 4.0 · B2): (1) the 8 algorithms sound with no NaN or clipping
    // and each one differs from the previous (same operators, another graph ⇒ another
    // spectrum); (2) per-operator decay works: with modulator 2 on a
    // short decay the onset tilt clearly exceeds the sustain's,
    // and with a flat decay it does not; (3) FM4 ≠ the 2-operator FM sine.
    body.appendChild(el('st-cat', 'FM4'));
    let r;
    try {
      const problems = [];
      const base = { waveA: 'fm4', levelA: 1, levelB: 0, cutoff: 20000, reso: 0.7, a: 0.002, d: 0.3, s: 0.8, r: 0.1, width: 0,
                     fm4R1: 1, fm4L1: 1, fm4D1: 4, fm4R2: 2, fm4L2: 0.6, fm4D2: 4, fm4R3: 1, fm4L3: 0.5, fm4D3: 4, fm4R4: 3, fm4L4: 0.4, fm4D4: 4 };
      const opt = { secs: 1.0, offAt: 0.9 };
      const diffW = (x, y, t0, t1) => { const cX = x.getChannelData(0), cY = y.getChannelData(0), i0 = Math.floor(t0 * SR), i1 = Math.min(cX.length, Math.floor(t1 * SR));
        let d = 0, en = 0; for (let i = i0; i < i1; i += 4) { const e = cX[i] - cY[i]; d += e * e; en += cX[i] * cX[i]; } return Math.sqrt(d / Math.max(1e-12, en)); };
      const bufs = [];
      for (let alg = 0; alg < 8; alg++) {
        loadState({ ...base, fm4Alg: String(alg) });
        const b = await renderOne(structuredClone(engine.S), opt), a = analyze(b);
        if (a.bad) problems.push('alg ' + alg + ': NaN/Inf');
        if (a.peak > 1) problems.push('alg ' + alg + ': clipping');
        if (a.peak <= SILENCE) problems.push('alg ' + alg + ' silent');
        bufs.push(b);
      }
      const dAlg = bufs.map((b, i) => i ? diffW(bufs[i - 1], b, 0.3, 0.85) : 1);
      dAlg.forEach((d, i) => { if (i && !(d > 0.15)) problems.push('alg ' + (i - 1) + ' and ' + i + ' barely differ (' + d.toFixed(3) + ')'); });
      loadState({ ...base, fm4Alg: '0', fm4D2: 0.06 });
      const bDec = await renderOne(structuredClone(engine.S), opt);
      const rDec = tiltW(bDec, 0.005, 0.05) / Math.max(1e-12, tiltW(bDec, 0.5, 0.85));
      const rFlat = tiltW(bufs[0], 0.005, 0.05) / Math.max(1e-12, tiltW(bufs[0], 0.5, 0.85));
      if (!(rDec > 2)) problems.push('op 2 decay: the onset is not brighter (' + rDec.toFixed(2) + ')');
      if (!(rFlat < 1.4)) problems.push('control: with flat decays the onset already differs (' + rFlat.toFixed(2) + ')');
      loadState({ ...base, waveA: 'sine', fmRatio: 2, fmIndex: 2 });
      const b2op = await renderOne(structuredClone(engine.S), opt);
      const d2 = diffW(bufs[0], b2op, 0.3, 0.85);
      if (!(d2 > 0.2)) problems.push('FM4 stack ≈ 2-op sine (' + d2.toFixed(3) + ')');
      console.log('fm4: diffs between algorithms', dAlg.slice(1).map(d => d.toFixed(2)).join(' '), '· op2 decay onset/sustain', rDec.toFixed(2), 'control', rFlat.toFixed(2), '· vs 2-op', d2.toFixed(2));
      r = { name: 'FM4 (8 different algorithms · per-operator decay · ≠ 2-op)', peak: analyze(bufs[0]).peak, ok: !problems.length, problems };
    } catch (e2) {
      r = { name: 'FM4 (8 different algorithms · per-operator decay · ≠ 2-op)', peak: 0, ok: false,
            problems: ['exception: ' + ((e2 && e2.message) || e2)] };
    }
    push(r);
  }

  {
    // FM4 · operator envelope clock: they must count from the note's
    // START, not from when the worklet is born (bug caught by the user with the
    // 808 Kick: «the hit only comes in sometimes»). An operator with a 30 ms decay is
    // a bright click; if the note is scheduled 250 ms into the future (as
    // the arp and the players do, and as happens live with main-thread
    // jitter), the click must still be there when the VCA opens: the spectral tilt of
    // the first 25 ms of the scheduled note ≈ that of the immediate note, and
    // both ≫ that of the body (sine) at 200 ms.
    body.appendChild(el('st-cat', 'FM4 · operator clock'));
    let r;
    try {
      const problems = [];
      const st = { waveA: 'fm4', levelA: 1, levelB: 0, fm4Alg: '0', fm4R1: 1, fm4L1: 1, fm4D1: 4, fm4R2: 1, fm4L2: 0.9, fm4D2: 0.03,
                   fm4R3: 1, fm4L3: 0, fm4D3: 4, fm4R4: 1, fm4L4: 0, fm4D4: 4, cutoff: 20000, reso: 0.7,
                   envCurve: 1, a: 0.001, d: 0.5, s: 0, r: 0.1, width: 0 };
      const render = async (S, when) => {
        const c = new OfflineAudioContext(2, Math.ceil(SR * 1.0), SR);
        const eng = new AudioEngine(); eng.S = S; await eng.init(c);
        if (when) eng._directOn('k1', NOTE1, 1, when); else eng.noteOn('k1', NOTE1, 1);
        c.suspend(0.9).then(() => { eng.noteOff('k1'); c.resume(); });
        return c.startRendering();
      };
      const onset = buf => { const d = buf.getChannelData(0); for (let i = 0; i < d.length; i++) if (Math.abs(d[i]) > 1e-3) return i / SR; return 0; };
      loadState(st);
      const bNow = await render(structuredClone(engine.S), 0);
      const bLater = await render(structuredClone(engine.S), 0.25);
      const aN = analyze(bNow), aL = analyze(bLater);
      if (aN.bad || aL.bad) problems.push('NaN/Inf');
      const oN = onset(bNow), oL = onset(bLater);
      if (!(oL > 0.2)) problems.push('the scheduled note does not start in the future (' + (oL * 1000).toFixed(0) + ' ms)');
      const atkN = tiltW(bNow, oN, oN + 0.025), atkL = tiltW(bLater, oL, oL + 0.025), body_ = tiltW(bNow, oN + 0.2, oN + 0.3);
      if (!(atkN > 2 * body_)) problems.push('the 30 ms operator does not give an attack brighter than the body (' + atkN.toExponential(2) + ' vs ' + body_.toExponential(2) + ')');
      if (!(atkL / Math.max(1e-12, atkN) > 0.7)) problems.push('the scheduled note loses the click (tilt ×' + (atkL / Math.max(1e-12, atkN)).toFixed(2) + ' relative to the immediate one)');
      console.log('fm4 clock: immediate attack tilt', atkN.toExponential(2), '· scheduled', atkL.toExponential(2), '· body', body_.toExponential(2), '· scheduled onset', (oL * 1000).toFixed(1), 'ms');
      r = { name: 'FM4 operator clock (the 30 ms click survives a note scheduled 250 ms into the future)', peak: aL.peak, ok: !problems.length, problems };
    } catch (e2) {
      r = { name: 'FM4 operator clock (the 30 ms click survives a note scheduled 250 ms into the future)', peak: 0, ok: false,
            problems: ['exception: ' + ((e2 && e2.message) || e2)] };
    }
    push(r);
  }

  {
    // Deterministic onset (percussion): with attack 0 the VCA opens as a STEP at t0
    // (the first quarter millisecond is already at level) and the worklet, which stays silent and
    // freezes its phases until t0 (quantized to a block boundary), starts the wave
    // at its configured phase: two notes scheduled in the future (200 and 300 ms,
    // like the live ones: the adaptive look-ahead always keeps t0 ahead
    // of the worklet's birth) give, aligned at their onset, the SAME
    // samples. Without the gate, the oscillator ran free from birth and the phase
    // at t0 was random (the kick's hit changed from one note to the next). The immediate
    // offline note (look-ahead 5 ms < worklet birth) does not go through the
    // gate: it is only used for the step.
    body.appendChild(el('st-cat', 'Deterministic onset'));
    let r;
    try {
      const problems = [];
      const st = { waveA: 'sine', phaseA: 90, levelA: 1, levelB: 0, cutoff: 20000, reso: 0.7, envCurve: 1, a: 0, d: 0.2, s: 0, r: 0.05, width: 0 };
      const render = async (S, when) => {
        const c = new OfflineAudioContext(2, Math.ceil(SR * 0.6), SR);
        const eng = new AudioEngine(); eng.S = S; await eng.init(c);
        if (when) eng._directOn('d1', NOTE1, 1, when); else eng.noteOn('d1', NOTE1, 1);
        c.suspend(0.5).then(() => { eng.noteOff('d1'); c.resume(); });
        return c.startRendering();
      };
      const onsetI = buf => { const d = buf.getChannelData(0); for (let i = 0; i < d.length; i++) if (Math.abs(d[i]) > 1e-3) return i; return -1; };
      loadState(st);
      const bNow = await render(structuredClone(engine.S), 0);
      const bL1 = await render(structuredClone(engine.S), 0.2);
      const bL2 = await render(structuredClone(engine.S), 0.3);
      const aN = analyze(bNow), aL = analyze(bL1);
      if (aN.bad || aL.bad || analyze(bL2).bad) problems.push('NaN/Inf');
      const iN = onsetI(bNow), i1 = onsetI(bL1), i2 = onsetI(bL2);
      if (iN < 0 || i1 < 0 || i2 < 0) problems.push('silence');
      else {
        const dN = bNow.getChannelData(0), d1 = bL1.getChannelData(0), d2 = bL2.getChannelData(0);
        const rmsI = (d, i0, n) => { let s = 0; for (let i = i0; i < i0 + n; i++) s += d[i] * d[i]; return Math.sqrt(s / n); };
        const q = Math.round(SR * 0.00025);
        const stepN = rmsI(dN, iN, q) / Math.max(1e-9, rmsI(dN, iN + 20 * q, q));   // first ¼ ms vs 5 ms later
        const step1 = rmsI(d1, i1, q) / Math.max(1e-9, rmsI(d1, i1 + 20 * q, q));
        if (!(stepN > 0.8 && step1 > 0.8)) problems.push('with attack 0 the VCA does not open as a step (initial ¼ ms / 5 ms = ' + stepN.toFixed(2) + ' · ' + step1.toFixed(2) + ')');
        // aligned by onset with a ±1 sample tolerance: the instant of the VCA
        // step is rounded to a sample from t0 in seconds and can fall one
        // sample earlier or later between renders (measured: 264 vs 265 samples after t0,
        // everything else identical); a random phase would give tens of dB at any offset
        const n = Math.floor(SR * 0.05);
        const diffAt = sh => { let m = 0; for (let i = 2; i < n && i1 + i < d1.length && i2 + i + sh < d2.length; i++) m = Math.max(m, Math.abs(d1[i1 + i] - d2[i2 + i + sh])); return m; };
        const maxDiff = Math.min(diffAt(-1), diffAt(0), diffAt(1));
        if (!(maxDiff < 1e-3)) problems.push('two scheduled notes do not start the same (max |Δ| ' + maxDiff.toExponential(2) + ' in the first 50 ms, best offset ±1 sample)');
        console.log('onset: step ¼ ms/5 ms', stepN.toFixed(3), '/', step1.toFixed(3), '· scheduled 200 vs 300 ms max |Δ|', maxDiff.toExponential(2), '· onsets', (iN / SR * 1000).toFixed(1), '/', (i1 / SR * 1000).toFixed(1), '/', (i2 / SR * 1000).toFixed(1), 'ms');
      }
      r = { name: 'deterministic onset (attack 0 = step · same phase in two scheduled notes)', peak: aN.peak, ok: !problems.length, problems };
    } catch (e2) {
      r = { name: 'deterministic onset (attack 0 = step · same phase in two scheduled notes)', peak: 0, ok: false,
            problems: ['exception: ' + ((e2 && e2.message) || e2)] };
    }
    push(r);
  }

  {
    // Envelope curve (Roadmap 4.0 · A3): with Curve 1 the attack rises quickly
    // (RMS halfway through the attack ≫ than with linear ramps) and the decay settles
    // early (RMS halfway through the decay ≪); the sustain is the same. With Curve 0 the
    // path is the usual one (linear ramps: covered by the golden).
    body.appendChild(el('st-cat', 'Envelope curve'));
    let r;
    try {
      const problems = [];
      const base = { waveA: 'sawtooth', levelA: 1, levelB: 0, cutoff: 20000, reso: 0.7, a: 0.3, d: 0.5, s: 0.3, r: 0.1, width: 0 };
      const opt = { secs: 1.4, offAt: 1.3 };
      loadState({ ...base, envCurve: 0 });
      const b0 = await renderOne(structuredClone(engine.S), opt);
      loadState({ ...base, envCurve: 1 });
      const b1 = await renderOne(structuredClone(engine.S), opt);
      const a0 = analyze(b0), a1 = analyze(b1);
      if (a0.bad || a1.bad) problems.push('NaN/Inf');
      if (a0.peak > 1 || a1.peak > 1) problems.push('clipping');
      const rmsW = (buf, t0, t1) => { const d = buf.getChannelData(0), i0 = Math.floor(t0 * SR), i1 = Math.min(d.length, Math.floor(t1 * SR));
        let s = 0; for (let i = i0; i < i1; i++) s += d[i] * d[i]; return Math.sqrt(s / Math.max(1, i1 - i0)); };
      const atk = rmsW(b1, 0.14, 0.18) / Math.max(1e-9, rmsW(b0, 0.14, 0.18));     // halfway through the attack (0.3 s)
      const dec = rmsW(b1, 0.53, 0.58) / Math.max(1e-9, rmsW(b0, 0.53, 0.58));     // halfway through the decay (0.3 + 0.5/2)
      const sus = rmsW(b1, 1.0, 1.25) / Math.max(1e-9, rmsW(b0, 1.0, 1.25));       // sustain: the same
      if (!(atk > 1.5)) problems.push('the curve does not speed up the attack (' + atk.toFixed(2) + ')');
      if (!(dec < 0.6)) problems.push('the curve does not settle the decay (' + dec.toFixed(2) + ')');
      if (!(Math.abs(sus - 1) < 0.1)) problems.push('the sustain changes with the curve (' + sus.toFixed(3) + ')');
      // release with the knob's curve: r = 0.5 s releasing in the sustain (1.0 s). Curve 0 → straight
      // (halfway through the release, half the amplitude); Curve 1 → RC (it settles: much less); both at 0 by r
      const baseR = { ...base, r: 0.5 }, optR = { secs: 1.6, offAt: 1.0 };
      loadState({ ...baseR, envCurve: 0 });
      const r0 = await renderOne(structuredClone(engine.S), optR);
      loadState({ ...baseR, envCurve: 1 });
      const r1 = await renderOne(structuredClone(engine.S), optR);
      const lin = rmsW(r0, 1.23, 1.27) / Math.max(1e-9, rmsW(r0, 0.9, 1.0));
      const relRC = rmsW(r1, 1.23, 1.27) / Math.max(1e-9, rmsW(r0, 1.23, 1.27));
      const relEnd = Math.max(rmsW(r0, 1.55, 1.6), rmsW(r1, 1.55, 1.6));
      if (!(Math.abs(lin - 0.5) < 0.12)) problems.push('the straight release is not at half halfway through (' + lin.toFixed(2) + ')');
      if (!(relRC < 0.6)) problems.push('the curve does not settle the release (' + relRC.toFixed(2) + ')');
      if (!(relEnd < 1e-4)) problems.push('the release does not reach 0 by r (' + dB(relEnd) + ')');
      // releasing DURING the attack (bug caught by the user: with setValueCurveAtTime
      // the release threw an exception and the voice got stuck) → the note must die
      loadState({ ...base, envCurve: 1 });
      const bCut = await renderOne(structuredClone(engine.S), { secs: 1.2, offAt: 0.15 });
      const tail = rmsW(bCut, 0.9, 1.2), aCut = analyze(bCut);
      if (aCut.bad) problems.push('releasing in the attack: NaN/Inf');
      if (!(tail < 1e-4)) problems.push('releasing during the attack does not silence the note (' + dB(tail) + ' at 0.9-1.2 s)');
      console.log('env curve: attack ×', atk.toFixed(2), '· decay ×', dec.toFixed(2), '· sustain ×', sus.toFixed(3), '· straight release halfway', lin.toFixed(2), '· RC release ×', relRC.toFixed(2), '· tail after releasing in the attack', dB(tail));
      r = { name: 'envelope curve (faster RC attack · decay settles · same sustain · release follows the knob)', peak: a1.peak, ok: !problems.length, problems };
    } catch (e2) {
      r = { name: 'envelope curve (faster RC attack · decay settles · same sustain)', peak: 0, ok: false,
            problems: ['exception: ' + ((e2 && e2.message) || e2)] };
    }
    push(r);
  }

  {
    // Clap flam (percussion): with Hits 3 and Gap 12 ms, before the ADSR
    // two bursts sound that fall to 0 before the next one — the end of each
    // gap is a VALLEY (RMS ≪ than halfway through the burst); with Hits 1 those
    // same windows are in the sustain (no valleys) and the path is the usual
    // one (bit-identical: covered by the golden). The last hit is the full ADSR
    // (the sustain arrives the same) and releasing DURING the flam silences the
    // note. Sine at 880 Hz (period 1.1 ms: the 2-3 ms windows average out).
    // The windows are measured from the real ONSET of the sound (first audible
    // sample), not from 0: the noteOn has look-ahead and the worklet takes time to be born.
    body.appendChild(el('st-cat', 'Clap flam'));
    let r;
    try {
      const problems = [];
      const F = 880, GAP = 0.012;
      const onset = buf => { const d = buf.getChannelData(0); for (let i = 0; i < d.length; i++) if (Math.abs(d[i]) > 1e-3) return i / SR; return 0; };
      const base = { waveA: 'sine', levelA: 1, levelB: 0, cutoff: 20000, reso: 0.7, a: 0.001, d: 0.1, s: 0.8, r: 0.05, width: 0, hitGap: GAP };
      const render = async (st, { secs = 0.6, offAt = 0.4 } = {}) => {
        const c = new OfflineAudioContext(2, Math.ceil(SR * secs), SR);
        const eng = new AudioEngine(); eng.S = st; await eng.init(c);
        eng.noteOn('f1', F, 1);
        c.suspend(offAt).then(() => { eng.noteOff('f1'); c.resume(); });
        return c.startRendering();
      };
      const rmsW = (buf, t0, t1) => { const d = buf.getChannelData(0), i0 = Math.floor(t0 * SR), i1 = Math.min(d.length, Math.floor(t1 * SR));
        let s = 0; for (let i = i0; i < i1; i++) s += d[i] * d[i]; return Math.sqrt(s / Math.max(1, i1 - i0)); };
      loadState({ ...base, hits: 1 });
      const b1 = await render(structuredClone(engine.S));
      loadState({ ...base, hits: 3 });
      const b3 = await render(structuredClone(engine.S));
      const a1 = analyze(b1), a3 = analyze(b3);
      if (a1.bad || a3.bad) problems.push('NaN/Inf');
      if (a1.peak > 1 || a3.peak > 1) problems.push('clipping');
      const T1 = onset(b1), T3 = onset(b3);
      if (Math.abs(T1 - T3) > 0.002) problems.push('the flam moves the note onset (' + (T1 * 1000).toFixed(1) + ' / ' + (T3 * 1000).toFixed(1) + ' ms)');
      const mid = (buf, i) => { const T0 = onset(buf); return rmsW(buf, T0 + i * GAP + 0.002, T0 + i * GAP + 0.005); };          // middle of burst i
      const valley = (buf, i) => { const T0 = onset(buf); return rmsW(buf, T0 + (i + 1) * GAP - 0.002, T0 + (i + 1) * GAP); };   // end of gap i
      const v3 = Math.max(valley(b3, 0), valley(b3, 1)) / Math.max(1e-9, Math.min(mid(b3, 0), mid(b3, 1)));
      const v1 = Math.min(valley(b1, 0), valley(b1, 1)) / Math.max(1e-9, mid(b1, 0));
      if (!(v3 < 0.5)) problems.push('the bursts do not fall to 0 before the next one (valley/burst ' + v3.toFixed(2) + ')');
      if (!(v1 > 0.7)) problems.push('without flam there are valleys (' + v1.toFixed(2) + ')');
      const sus = rmsW(b3, 0.25, 0.35) / Math.max(1e-9, rmsW(b1, 0.25, 0.35));
      if (!(Math.abs(sus - 1) < 0.05)) problems.push('the sustain changes with the flam (' + sus.toFixed(3) + ')');
      const tail = rmsW(b3, 0.5, 0.6);
      if (!(tail < 1e-4)) problems.push('the note with flam does not die after release (' + dB(tail) + ')');
      // releasing DURING the flam (at 12 ms, between the 1st and 2nd of four bursts): it must die
      loadState({ ...base, hits: 4 });
      const bCut = await render(structuredClone(engine.S), { secs: 0.4, offAt: 0.012 });
      const tailCut = rmsW(bCut, 0.2, 0.4);
      if (analyze(bCut).bad) problems.push('releasing in the flam: NaN/Inf');
      if (!(tailCut < 1e-4)) problems.push('releasing during the flam does not silence the note (' + dB(tailCut) + ')');
      console.log('flam: onset', (T3 * 1000).toFixed(1), 'ms · valley/burst with 3 hits', v3.toFixed(3), '· without flam', v1.toFixed(3), '· sustain ×', sus.toFixed(3), '· tail after release', dB(tail), '· release in the flam', dB(tailCut));
      r = { name: 'clap flam (bursts with valleys · no valleys without flam · same sustain · releasing in the flam silences)', peak: a3.peak, ok: !problems.length, problems };
    } catch (e2) {
      r = { name: 'clap flam (bursts with valleys · no valleys without flam · same sustain · releasing in the flam silences)', peak: 0, ok: false,
            problems: ['exception: ' + ((e2 && e2.message) || e2)] };
    }
    push(r);
  }

  {
    // A4 · filter type. Saw at C3 with the cutoff on its 4th harmonic (C5,
    // 523.25 Hz): Goertzel measures the energy of that harmonic against that of the
    // fundamental (2 octaves below). Notch: the cutoff harmonic
    // disappears (> 20 dB less than in LP). BP: the fundamental drops and the cutoff
    // one passes (> 10 dB more than in LP); at 24 dB, even more. And the cookbook
    // demonstration: the morph at 50 % IS the notch at −6 dB → RMS exactly half.
    body.appendChild(el('st-cat', 'BP / notch filter'));
    let r;
    try {
      const base = { waveA: 'sawtooth', levelA: 1, levelB: 0, cutoff: 523.25, reso: 2, a: 0.001, d: 0.01, s: 1, r: 0.05, master: 0.7 };
      const rend = async extra => { loadState({ ...base, ...extra }); return renderOne(structuredClone(engine.S), { secs: 0.8, offAt: 0.6 }); };
      const bLP = await rend({ morph: 0 }), bM50 = await rend({ morph: 0.5 }), bN = await rend({ filterType: 'notch' });
      const bBP = await rend({ filterType: 'bp' }), bBP24 = await rend({ filterType: 'bp', filterSlope: '24' });
      const goe = (buf, f, t0, t1) => {         // Goertzel energy of a tone in a window
        const d = buf.getChannelData(0), i0 = Math.floor(t0 * SR), i1 = Math.min(d.length, Math.floor(t1 * SR));
        const cw = 2 * Math.cos(2 * Math.PI * f / SR);
        let s1 = 0, s2 = 0;
        for (let i = i0; i < i1; i++) { const s0 = d[i] + cw * s1 - s2; s2 = s1; s1 = s0; }
        return s1 * s1 + s2 * s2 - cw * s1 * s2;
      };
      const ratio = b => goe(b, 523.25, 0.15, 0.55) / Math.max(1e-12, goe(b, 130.81, 0.15, 0.55));   // cutoff harmonic / fundamental
      const rms = b => { const d = b.getChannelData(0), i0 = Math.floor(0.15 * SR), i1 = Math.floor(0.55 * SR); let e = 0; for (let i = i0; i < i1; i++) e += d[i] * d[i]; return Math.sqrt(e / (i1 - i0)); };
      const problems = [];
      for (const [n, b] of [['LP', bLP], ['morph 50', bM50], ['notch', bN], ['BP', bBP], ['BP 24', bBP24]]) {
        const a = analyze(b);
        if (a.bad) problems.push(n + ': NaN/Inf'); if (a.peak <= SILENCE) problems.push(n + ': silence'); if (a.peak > 1) problems.push(n + ': clipping ' + dB(a.peak));
      }
      const rLP = ratio(bLP), rN = ratio(bN), rBP = ratio(bBP), rBP24 = ratio(bBP24), half = rms(bM50) / Math.max(1e-12, rms(bN));
      const dBr = (x, y) => (10 * Math.log10(x / Math.max(1e-30, y))).toFixed(1);
      if (!(rN < rLP * 0.01)) problems.push('notch: the cutoff harmonic does not drop 20 dB (' + dBr(rN, rLP) + ' dB against LP)');
      if (!(rBP > rLP * 10)) problems.push('BP: the cutoff does not dominate the fundamental (' + dBr(rBP, rLP) + ' dB against LP)');
      if (!(rBP24 > rBP * 3)) problems.push('BP 24 dB is not narrower than 12 (' + dBr(rBP24, rBP) + ' dB)');
      if (!(Math.abs(half - 0.5) < 0.03)) problems.push('morph 50 % ≠ notch at −6 dB (RMS ×' + half.toFixed(3) + ')');
      console.log('filter BP notch: notch', dBr(rN, rLP), 'dB · BP', dBr(rBP, rLP), 'dB · BP24 vs BP', dBr(rBP24, rBP), 'dB · morph 50 / notch RMS ×', half.toFixed(3));
      r = { name: 'BP / notch filter (Goertzel at the cutoff · morph 50 % = notch at −6 dB)', peak: analyze(bN).peak, ok: !problems.length, problems };
    } catch (e2) {
      r = { name: 'BP / notch filter (Goertzel at the cutoff · morph 50 % = notch at −6 dB)', peak: 0, ok: false, problems: ['exception: ' + ((e2 && e2.message) || e2)] };
    }
    push(r);
  }

  {
    // 9 · S&H and drift LFO. (1) The buffers: S&H = steps (constant within
    // each unit, jumps between units), drift = continuous (tiny per-sample
    // jump), peak 1 and a seamless loop. (2) In the engine: cutoff with
    // 'sh' and 'drift' sounds, differs from the sine and from each other; the spectral tilt over
    // 4-period windows is a STAIRCASE with S&H (most windows do not
    // change) and makes no big jumps with the drift. (3) The matrix reads the
    // new source (lfoCut→cutoff with the LFO Level at 0: S&H ≠ sine).
    body.appendChild(el('st-cat', 'LFO S&H / drift'));
    let r;
    try {
      const problems = [];
      const bufs = lfoBuffers(new OfflineAudioContext(1, 8, SR));
      const sh = bufs.sh.getChannelData(0), dr = bufs.drift.getChannelData(0), uLen = Math.round(8000 * bufs.unit), steps = sh.length / uLen;
      let flat = true, jumps = 0;
      for (let k = 0; k < steps; k++) { const v = sh[k * uLen]; for (let i = 1; i < uLen; i += 97) if (sh[k * uLen + i] !== v) flat = false; if (k && Math.abs(v - sh[(k - 1) * uLen]) > 0.05) jumps++; }
      if (!flat) problems.push('S&H: not constant within the step');
      if (jumps < steps * 0.8) problems.push('S&H: only ' + jumps + ' jumps out of ' + (steps - 1));
      let maxD = 0, pk = 0; for (let i = 1; i < dr.length; i++) { maxD = Math.max(maxD, Math.abs(dr[i] - dr[i - 1])); pk = Math.max(pk, Math.abs(dr[i])); }
      if (!(maxD < 0.01)) problems.push('drift: per-sample jump ' + maxD.toFixed(4));
      if (!(pk > 0.99 && pk <= 1.0001)) problems.push('drift: peak ' + pk.toFixed(3) + ' ≠ 1');
      if (!(Math.abs(dr[0] - dr[dr.length - 1]) < 0.01)) problems.push('drift: seam in the loop ' + Math.abs(dr[0] - dr[dr.length - 1]).toFixed(3));
      const base = { waveA: 'sawtooth', levelA: 1, levelB: 0, cutoff: 2500, reso: 3, cutLfoLvl: 1800, cutLfoSpd: 6, a: 0.005, d: 0.05, s: 1, r: 0.05, master: 0.7 };
      const rend = async extra => { loadState({ ...base, ...extra }); return renderOne(structuredClone(engine.S), { secs: 1.3, offAt: 1.1 }); };
      const diffB = (x, y) => { const cX = x.getChannelData(0), cY = y.getChannelData(0), len = Math.min(cX.length, cY.length); let d = 0, en = 0;
        for (let k = 0; k < len; k += 4) { const e = cX[k] - cY[k]; d += e * e; en += cX[k] * cX[k]; } return Math.sqrt(d / Math.max(1e-12, en)); };
      const bSin = await rend({ cutLfoShape: 'sine' }), bSH = await rend({ cutLfoShape: 'sh' }), bDr = await rend({ cutLfoShape: 'drift', cutLfoSpd: 1.5 });
      for (const [n, b] of [['sine', bSin], ['S&H', bSH], ['drift', bDr]]) { const a = analyze(b); if (a.bad) problems.push(n + ': NaN/Inf'); if (a.peak <= SILENCE) problems.push(n + ': silence'); if (a.peak > 1) problems.push(n + ': clipping ' + dB(a.peak)); }
      const dSH = diffB(bSin, bSH), dDr = diffB(bSin, bDr), dX = diffB(bSH, bDr);
      if (!(dSH > 0.1 && dDr > 0.1 && dX > 0.1)) problems.push('the shapes cannot be told apart (diffs ' + dSH.toFixed(2) + ' / ' + dDr.toFixed(2) + ' / ' + dX.toFixed(2) + ')');
      const W = 4 / NOTE1;   // windows of exactly 4 periods of C3 (30.6 ms): within a step the signal is periodic and the tilt does not oscillate
      const tilts = b => { const out = []; for (let t = 0.2; t < 1.0; t += W) out.push(tiltW(b, t, t + W)); return out; };
      const stair = ts => { const d = ts.slice(1).map((v, i) => Math.abs(v - ts[i])), range = Math.max(...ts) - Math.min(...ts);
        return { still: d.filter(x => x < range * 0.03).length / d.length, maxJump: Math.max(...d) / range }; };
      const sSH = stair(tilts(bSH)), sDr = stair(tilts(bDr));
      if (!(sSH.still > 0.6)) problems.push('S&H is not a staircase (only ' + (sSH.still * 100).toFixed(0) + ' % of windows still)');
      if (!(sDr.maxJump < 0.35)) problems.push('the drift jumps (maximum ' + (sDr.maxJump * 100).toFixed(0) + ' % of the range per window)');
      const bMx1 = await rend({ cutLfoLvl: 0, cutLfoShape: 'sine', mx1src: 'lfoCut', mx1dst: 'cutoff', mx1amt: 0.8 });
      const bMx2 = await rend({ cutLfoLvl: 0, cutLfoShape: 'sh', mx1src: 'lfoCut', mx1dst: 'cutoff', mx1amt: 0.8 });
      const dMx = diffB(bMx1, bMx2);
      if (!(dMx > 0.1)) problems.push('the matrix does not see the S&H shape (diff ' + dMx.toFixed(2) + ')');
      console.log('lfo sh drift: diffs vs sine', dSH.toFixed(2), dDr.toFixed(2), '· S&H still windows', (sSH.still * 100).toFixed(0) + '%', '· drift max jump', (sDr.maxJump * 100).toFixed(0) + '%', '· matrix', dMx.toFixed(2));
      r = { name: 'LFO S&H / drift (buffers · distinct shapes · staircase vs continuous · matrix)', peak: analyze(bSH).peak, ok: !problems.length, problems };
    } catch (e2) {
      r = { name: 'LFO S&H / drift (buffers · distinct shapes · staircase vs continuous · matrix)', peak: 0, ok: false, problems: ['exception: ' + ((e2 && e2.message) || e2)] };
    }
    push(r);
  }

  // ---------- Roadmap 5.0 · block 1: time ×10 + per-oscillator octave ----------
  {
    body.appendChild(el('st-cat', 'Time ×10 and octave'));
    const rmsW = (buf, t0, t1) => { const d = buf.getChannelData(0), i0 = Math.floor(t0 * SR), i1 = Math.min(d.length, Math.floor(t1 * SR));
      let s = 0; for (let i = i0; i < i1; i++) s += d[i] * d[i]; return Math.sqrt(s / Math.max(1, i1 - i0)); };
    // Per-oscillator octave: fundamental frequency from the zero crossings of a clean
    // sine (C3 = 130.81 Hz: at −1 it must give ~65.4 Hz, at +1 ~261.6) and the mono
    // glide keeps the octave (glideTo multiplies by the oscillator's ratio).
    {
      const NAME = 'per-oscillator octave (−1 = sub · +1 · glide keeps the octave)';
      let r;
      try {
        const problems = [];
        const base = { waveA: 'sine', levelA: 1, levelB: 0, cutoff: 20000, reso: 0.7, a: 0.005, d: 0.05, s: 1, r: 0.05, width: 0 };
        const hzOf = (buf, t0, t1) => { const d = buf.getChannelData(0), i0 = Math.floor(t0 * SR), i1 = Math.min(d.length, Math.floor(t1 * SR));
          let n = 0; for (let i = i0 + 1; i < i1; i++) if ((d[i - 1] < 0) !== (d[i] < 0)) n++; return n / 2 / ((i1 - i0) / SR); };
        const one = async st => { loadState(st); return renderOne(structuredClone(engine.S), { secs: 1.6, offAt: 1.5 }); };
        const b0 = await one({ ...base, octA: 0 }), bSub = await one({ ...base, octA: -1 }), bUp = await one({ ...base, octA: 1 });
        const f0 = hzOf(b0, 0.5, 1.5), fSub = hzOf(bSub, 0.5, 1.5), fUp = hzOf(bUp, 0.5, 1.5);
        if (!(Math.abs(f0 - NOTE1) < 2)) problems.push('octave 0 does not give C3 (' + f0.toFixed(1) + ' Hz)');
        if (!(Math.abs(fSub - NOTE1 / 2) < 1.5)) problems.push('octave −1 does not give C2 (' + fSub.toFixed(1) + ' Hz)');
        if (!(Math.abs(fUp - NOTE1 * 2) < 3)) problems.push('octave +1 does not give C4 (' + fUp.toFixed(1) + ' Hz)');
        // mono glide: C3 → G3 with octave −1 must end on G2 (98 Hz)
        loadState({ ...base, octA: -1, mode: 'mono', glide: 0.2 });
        const ctxG = new OfflineAudioContext(2, Math.ceil(SR * 1.6), SR);
        const eng = new AudioEngine(); eng.S = structuredClone(engine.S); await eng.init(ctxG);
        eng.noteOn('g1', NOTE1);
        ctxG.suspend(0.5).then(() => { eng.noteOn('g2', NOTE2); ctxG.resume(); });
        const bG = await ctxG.startRendering();
        const fG = hzOf(bG, 1.0, 1.5);
        if (!(Math.abs(fG - NOTE2 / 2) < 1.5)) problems.push('the glide does not keep the octave (' + fG.toFixed(1) + ' Hz, expected ' + (NOTE2 / 2).toFixed(1) + ')');
        console.log('octave: 0 / −1 / +1', f0.toFixed(1), fSub.toFixed(1), fUp.toFixed(1), 'Hz · glide at −1 ends on', fG.toFixed(1), 'Hz');
        r = { name: NAME, peak: analyze(bSub).peak, ok: !problems.length, problems };
      } catch (e2) { r = { name: NAME, peak: 0, ok: false, problems: ['exception: ' + ((e2 && e2.message) || e2)] }; }
      push(r);
    }
    // Times ×10: 10 s attack (linear ramp: the level at 1 s is half that at
    // 2 s), 20 s release (2 s after release ~90 % is left), the PARAMS table is
    // consistent (every log has a floor; with min 0, position 0 is exactly 0) and the
    // controls give back EXACTLY what they are set to (the sliders no longer quantize).
    {
      const NAME = 'times ×10 (10 s attack · 20 s release · log PARAMS with exact 0 · exact controls)';
      let r;
      try {
        const problems = [];
        const base = { waveA: 'sawtooth', levelA: 1, levelB: 0, cutoff: 20000, reso: 0.7, d: 0.1, s: 1, width: 0, envCurve: 0 };
        loadState({ ...base, a: 10, r: 0.1 });
        const bA = await renderOne(structuredClone(engine.S), { secs: 2.2, offAt: 2.1 });
        const qA = rmsW(bA, 0.9, 1.0) / Math.max(1e-9, rmsW(bA, 1.9, 2.0));
        if (!(qA > 0.4 && qA < 0.6)) problems.push('10 s attack: level at 1 s / at 2 s = ' + qA.toFixed(3) + ' (expected ≈0.49)');
        loadState({ ...base, a: 0.005, r: 20 });
        const bR = await renderOne(structuredClone(engine.S), { secs: 2.5, offAt: 0.3 });
        const qR = rmsW(bR, 2.2, 2.4) / Math.max(1e-9, rmsW(bR, 0.1, 0.3));
        if (!(qR > 0.8 && qR < 0.97)) problems.push('20 s release: level 2 s after release / sustain = ' + qR.toFixed(3) + ' (expected ≈0.90)');
        for (const k in PARAMS) {
          const p = PARAMS[k]; if (!p.log) continue;
          const lo = p.min > 0 ? p.min : p.lmin;
          if (!(lo > 0 && lo < p.max)) { problems.push(k + ': log without a floor'); continue; }
          for (const v of [p.def, lo * 3, p.max]) if (!(Math.abs(posToVal(p, valToPos(p, v)) - v) <= 1e-9 * Math.max(1, v))) problems.push(k + ': round trip of ' + v + ' → ' + posToVal(p, valToPos(p, v)));
          if (p.min === 0 && (valToPos(p, 0) !== 0 || posToVal(p, 0) !== 0)) problems.push(k + ': 0 is not position 0');
        }
        const ex = (name, v) => { CONTROLS[name].set(v); const g = CONTROLS[name].get(); if (g !== v) problems.push(name + ': set ' + v + ' → get ' + g); };
        ex('a', 12.345); ex('a', 0); ex('d', 0.001); ex('r', 30); ex('cutoff', 1180); ex('cutLfoSpd', 0.005); ex('glide', 0); ex('reverbSize', 20);
        loadState({});
        console.log('long times: attack 10 s level 1 s/2 s', qA.toFixed(3), '· release 20 s at 2 s', qR.toFixed(3));   // (prefix without «×» or commas: the runner filters the measurement logs by /^[a-z0-9 ]+:/)
        r = { name: NAME, peak: analyze(bR).peak, ok: !problems.length, problems };
      } catch (e2) { r = { name: NAME, peak: 0, ok: false, problems: ['exception: ' + ((e2 && e2.message) || e2)] }; }
      push(r);
    }
    // LFO at a true 0.005 Hz: the native sine travels sin(2π·0.005·1 s) = 0.031
    // in one second (neither clipped to 0.05 nor stopped) and the S&H (buffer at
    // playbackRate 0.0005) holds its step for the whole render.
    {
      const NAME = 'LFO at 0.005 Hz (native sine and buffer S&H)';
      let r;
      try {
        const problems = [];
        const ctxL = new OfflineAudioContext(2, SR, SR);
        const merge = ctxL.createChannelMerger(2); merge.connect(ctxL.destination);
        const l1 = mkLFO(ctxL, 0.005, 1); l1.out.connect(merge, 0, 0);
        const l2 = mkLFO(ctxL, 0.005, 1); setLfoShape(ctxL, l2, 'sh'); l2.out.connect(merge, 0, 1);
        const b = await ctxL.startRendering();
        const s = b.getChannelData(0), h = b.getChannelData(1);
        let sMax = -2, sMin = 2, hMax = -2, hMin = 2;
        for (let i = 0; i < s.length; i++) { if (s[i] > sMax) sMax = s[i]; if (s[i] < sMin) sMin = s[i]; if (h[i] > hMax) hMax = h[i]; if (h[i] < hMin) hMin = h[i]; }
        const expected = Math.sin(2 * Math.PI * 0.005);
        if (!(Math.abs(sMax - expected) < 0.004 && sMin > -1e-4)) problems.push('sine at 0.005 Hz: max ' + sMax.toFixed(4) + ' min ' + sMin.toFixed(4) + ' (expected to rise up to ' + expected.toFixed(4) + ')');
        if (!(hMax - hMin < 1e-4)) problems.push('S&H at 0.005 Hz changes step within 1 s (range ' + (hMax - hMin).toExponential(2) + ')');
        console.log('slow lfo: sine at 0.005 Hz max', sMax.toFixed(4), 'expected', expected.toFixed(4), '· S&H range', (hMax - hMin).toExponential(2));
        r = { name: NAME, peak: Math.abs(sMax), ok: !problems.length, problems };
      } catch (e2) { r = { name: NAME, peak: 0, ok: false, problems: ['exception: ' + ((e2 && e2.message) || e2)] }; }
      push(r);
    }
    // Long hall and delay: the 20 s IR is 20 s long and at 10 s it keeps
    // (1/2)^2.5 ≈ 18 % of its initial level; plateDecay is monotonic up to 20 s and
    // stays under the worklet's cap (0.98); with a pluck, the Size 20 tail at
    // 3.5 s is ≫ that of Size 4 (IR and plate); the delay at 3.5 s returns the
    // echo where it should (the line used to be 2 s long and the time was clipped).
    {
      const NAME = 'long hall and delay (20 s IR · plate up to 20 s · echo at 3.5 s)';
      let r;
      try {
        const problems = [];
        const ctxI = new OfflineAudioContext(2, SR, SR);
        const tIR = performance.now(), ir = makeIR(ctxI, 20, 2.5, 0), msIR = performance.now() - tIR;
        if (ir.length !== 20 * SR) problems.push('the 20 s IR is ' + ir.length + ' samples long');
        const qIR = rmsW(ir, 9.9, 10.1) / Math.max(1e-9, rmsW(ir, 0.05, 0.25));
        if (!(qIR > 0.12 && qIR < 0.26)) problems.push('IR at 10 s / start = ' + qIR.toFixed(3) + ' (expected ≈0.18)');
        const pd = [4, 8.25, 12, 16.2, 20].map(plateDecay);
        if (!pd.every((v, i) => i === 0 || v > pd[i - 1]) || !(pd[4] > 0.93 && pd[4] < 0.98)) problems.push('plateDecay is not monotonic/bounded: ' + pd.map(x => x.toFixed(3)).join(' '));
        const pl = { waveA: 'sawtooth', levelA: 1, levelB: 0, cutoff: 8000, reso: 0.7, a: 0.002, d: 0.08, s: 0, r: 0.05, width: 0, reverbMix: 0.6, reverbPre: 0 };
        const tails = {};
        for (const type of ['hall', 'plate']) {
          loadState({ ...pl, reverbType: type, reverbSize: 4 });
          const b4 = await renderOne(structuredClone(engine.S), { secs: 4, offAt: 0.1 });
          loadState({ ...pl, reverbType: type, reverbSize: 20 });
          const b20 = await renderOne(structuredClone(engine.S), { secs: 4, offAt: 0.1 });
          const c20 = rmsW(b20, 3.5, 4), c4 = rmsW(b4, 3.5, 4);
          tails[type] = [c20, c4];
          if (!(c20 > 1e-3 * HR)) problems.push(type + ': Size 20 with no audible tail at 3.5 s (' + dB(c20) + ')');
          if (!(c20 > 3 * c4)) problems.push(type + ': the Size 20 tail at 3.5 s is not ≫ that of Size 4 (' + dB(c20) + ' vs ' + dB(c4) + ')');
          if (analyze(b20).bad) problems.push(type + ': NaN/Inf with Size 20');
        }
        const dl = { waveA: 'sawtooth', levelA: 1, levelB: 0, cutoff: 8000, reso: 0.7, a: 0.002, d: 0.05, s: 0, r: 0.05, width: 0,
                     dlyAmt: 0.6, dlyTime: 3.5, dlySync: 'free', dlyDamp: 0, reverbMix: 0 };
        loadState(dl);
        const bD = await renderOne(structuredClone(engine.S), { secs: 4.2, offAt: 0.1 });
        const echo = rmsW(bD, 3.5, 3.8), gap = rmsW(bD, 2.0, 3.4);
        if (!(echo > 1e-3 && echo > 10 * gap)) problems.push('3.5 s echo: ' + dB(echo) + ' against ' + dB(gap) + ' in the gap before it');
        loadState({});
        console.log('long hall: IR 20 s in', msIR.toFixed(0), 'ms · level at 10 s', qIR.toFixed(3), '· plateDecay 4/8.25/12/16.2/20 =', pd.map(x => x.toFixed(3)).join(' '),
                    '· tail 3.5 s IR 20/4', dB(tails.hall[0]), dB(tails.hall[1]), '· plate 20/4', dB(tails.plate[0]), dB(tails.plate[1]), '· echo 3.5 s', dB(echo), 'gap', dB(gap));
        r = { name: NAME, peak: analyze(bD).peak, ok: !problems.length, problems };
      } catch (e2) { r = { name: NAME, peak: 0, ok: false, problems: ['exception: ' + ((e2 && e2.message) || e2)] }; }
      push(r);
    }
  }

  // ---------- Roadmap 5.0 · block 2: per-voice drift + per-voice phase ----------
  {
    body.appendChild(el('st-cat', 'Per-voice drift and phase'));
    // Amplitude track of ONE note inside the chord: Goertzel with a Hann window
    // in 50 ms hops at the note's frequency (the other note lies more than
    // three bins away and the Hann puts it below −31 dB). Amplitude per window.
    const track = (buf, f, t0, t1, hop = 0.05) => {
      const d = buf.getChannelData(0), N = Math.floor(hop * SR), w = 2 * Math.PI * f / SR, c = 2 * Math.cos(w), out = [];
      for (let t = t0; t + hop <= t1 + 1e-9; t += hop) {
        const i0 = Math.floor(t * SR); let s1 = 0, s2 = 0;
        for (let i = 0; i < N; i++) { const x = d[i0 + i] * (0.5 - 0.5 * Math.cos(2 * Math.PI * i / N)); const s0 = x + c * s1 - s2; s2 = s1; s1 = s0; }
        out.push(Math.sqrt(Math.max(0, s1 * s1 + s2 * s2 - c * s1 * s2)) / N);
      }
      return out;
    };
    const corr = (a, b) => { const n = Math.min(a.length, b.length); let ma = 0, mb = 0; for (let i = 0; i < n; i++) { ma += a[i]; mb += b[i]; } ma /= n; mb /= n;
      let sab = 0, saa = 0, sbb = 0; for (let i = 0; i < n; i++) { sab += (a[i] - ma) * (b[i] - mb); saa += (a[i] - ma) ** 2; sbb += (b[i] - mb) ** 2; }
      return sab / Math.sqrt(Math.max(1e-18, saa * sbb)); };
    const swing = a => Math.max(...a) / Math.max(1e-9, Math.min(...a));
    // C3 + G3 chord pressed together and held for the whole render
    const chord = async (st, secs = 2.5) => { loadState(st); const ctx = new OfflineAudioContext(2, Math.ceil(SR * secs), SR);
      const eng = new AudioEngine(); eng.S = structuredClone(engine.S); await eng.init(ctx);
      eng.noteOn('c1', NOTE1); eng.noteOn('c2', NOTE2); return ctx.startRendering(); };
    // Low level on purpose: two sines with their amplitude modulated up to ×2 would add up to
    // ~2.0 and the Room's LIMITER (threshold −3 dB) would compress them together,
    // coupling the two tracks (false corr). This way the chord's peak stays at ~0.4.
    const base = { waveA: 'sine', levelA: 1, levelB: 0, cutoff: 20000, reso: 0.7, a: 0.005, d: 0.05, s: 1, r: 0.05, width: 0, amplitude: 0.25, master: 0.4 };
    // Per-voice phase: with the cutoff LFO (raw, via matrix → amplitude) the two
    // notes rise and fall together in 'global' (corr ≈ 1) and 0.618 of a cycle
    // apart in 'voice' (corr ≈ cos(2π·0.618) = −0.74). The first voice in 'voice'
    // sounds as in 'global' (phase 0: the sine buffer ≡ the native oscillator).
    {
      const NAME = 'per-voice LFO phase (global: together · per voice: 0.618 of a cycle apart · voice 0 = the global one · shape buffers)';
      let r;
      try {
        const problems = [];
        const st = { ...base, cutLfoLvl: 0, cutLfoSpd: 1, cutLfoShape: 'sine', mx1src: 'lfoCut', mx1dst: 'amp', mx1amt: 0.8 };
        const bG = await chord({ ...st, lfoPhase: 'global' }), bV = await chord({ ...st, lfoPhase: 'voice' });
        const g1 = track(bG, NOTE1, 0.3, 2.3), g2 = track(bG, NOTE2, 0.3, 2.3), v1 = track(bV, NOTE1, 0.3, 2.3), v2 = track(bV, NOTE2, 0.3, 2.3);
        const cG = corr(g1, g2), cV = corr(v1, v2), c11 = corr(g1, v1);
        if (!(swing(g1) > 2 && swing(v1) > 2 && swing(v2) > 2)) problems.push('the LFO does not move the amplitude (swing ' + [swing(g1), swing(v1), swing(v2)].map(x => x.toFixed(2)).join(' / ') + ')');
        if (!(cG > 0.95)) problems.push('global phase: the two notes do not move together (corr ' + cG.toFixed(3) + ')');
        if (!(cV < -0.4)) problems.push('per-voice phase: the two notes are not out of phase (corr ' + cV.toFixed(3) + ', expected ≈ −0.74)');
        if (!(c11 > 0.98)) problems.push('the first voice in «per voice» does not sound as in «global» (corr ' + c11.toFixed(3) + ')');
        // buffers of the native shapes: the native oscillator's phases (sin/tri/saw start at 0 rising, sqr at +1)
        const bf = lfoBuffers(new OfflineAudioContext(1, 8, SR)), q = n => bf[n].getChannelData(0), L = bf.sine.length;
        const okB = Math.abs(q('sine')[L / 4] - 1) < 1e-3 && q('square')[0] === 1 && q('square')[L / 2] === -1
          && Math.abs(q('triangle')[L / 4] - 1) < 1e-3 && Math.abs(q('sawtooth')[L / 4] - 0.5) < 1e-3 && Math.abs(q('sawtooth')[L / 2] + 1) < 1e-3;
        if (!okB) problems.push('the shape buffers do not reproduce the native oscillator\'s phases');
        console.log('voice phase: global corr', cG.toFixed(3), '· per voice', cV.toFixed(3), '· voice 0 vs global', c11.toFixed(3), '· swing', swing(v1).toFixed(2));
        r = { name: NAME, peak: analyze(bV).peak, ok: !problems.length, problems };
      } catch (e2) { r = { name: NAME, peak: 0, ok: false, problems: ['exception: ' + ((e2 && e2.message) || e2)] }; }
      push(r);
    }
    // Per-voice drift: 'drift' source → amplitude at 3 Hz (fast so it shows in
    // 2 s): each note wanders on its own (both move and not in step), the
    // render is REPRODUCIBLE (Weyl sequence: two renders bit-identical) and
    // at 0.005 Hz the drift barely moves in 2 s.
    {
      const NAME = 'per-voice drift («Drift (voice)» source · decorrelated voices · reproducible render · still at 0.005 Hz)';
      let r;
      try {
        const problems = [];
        const st = { ...base, mx1src: 'drift', mx1dst: 'amp', mx1amt: 1, mxDriftSpd: 3 };
        const bA = await chord(st), bB = await chord(st);
        const a1 = track(bA, NOTE1, 0.3, 2.3), a2 = track(bA, NOTE2, 0.3, 2.3);
        const cD = corr(a1, a2);
        if (!(swing(a1) > 1.5 && swing(a2) > 1.5)) problems.push('the drift does not move the amplitude (swing ' + swing(a1).toFixed(2) + ' / ' + swing(a2).toFixed(2) + ')');
        if (!(Math.abs(cD) < 0.85)) problems.push('the two voices drift the same (corr ' + cD.toFixed(3) + ')');
        const dA = bA.getChannelData(0), dB = bB.getChannelData(0); let md = 0;
        for (let i = 0; i < dA.length; i++) { const e = Math.abs(dA[i] - dB[i]); if (e > md) md = e; }
        if (!(md < 1e-6)) problems.push('two identical renders differ (max |Δ| ' + md.toExponential(2) + '): the drift is not deterministic');
        const bS = await chord({ ...st, mxDriftSpd: 0.005 });
        const s1 = track(bS, NOTE1, 0.3, 2.3);
        if (!(swing(s1) < 1.3)) problems.push('at 0.005 Hz the drift moves too much in 2 s (swing ' + swing(s1).toFixed(3) + ')');
        console.log('voice drift: corr between notes', cD.toFixed(3), '· swing', swing(a1).toFixed(2), swing(a2).toFixed(2), '· renders max |Δ|', md.toExponential(2), '· at 0.005 Hz swing', swing(s1).toFixed(3));
        r = { name: NAME, peak: analyze(bA).peak, ok: !problems.length, problems };
      } catch (e2) { r = { name: NAME, peak: 0, ok: false, problems: ['exception: ' + ((e2 && e2.message) || e2)] }; }
      push(r);
    }
  }

  // ---------- Roadmap 5.0 · block 3: shimmer + freeze ----------
  {
    body.appendChild(el('st-cat', 'Shimmer and freeze'));
    const rmsW = (buf, t0, t1) => { const d = buf.getChannelData(0), i0 = Math.floor(t0 * SR), i1 = Math.min(d.length, Math.floor(t1 * SR));
      let s = 0; for (let i = i0; i < i1; i++) s += d[i] * d[i]; return Math.sqrt(s / Math.max(1, i1 - i0)); };
    const goertzel = (buf, f, t0, t1) => { const d = buf.getChannelData(0), i0 = Math.floor(t0 * SR), i1 = Math.min(d.length, Math.floor(t1 * SR)), N = i1 - i0;
      const c = 2 * Math.cos(2 * Math.PI * f / SR); let s1 = 0, s2 = 0;
      for (let i = i0; i < i1; i++) { const s0 = d[i] + c * s1 - s2; s2 = s1; s1 = s0; }
      return Math.sqrt(Math.max(0, s1 * s1 + s2 * s2 - c * s1 * s2)) / N; };
    // The shifter on its own: a 440 Hz sine goes in and comes out at 880 (+12) or at
    // 659.3 (+7), with the original fundamental ≫ below and the energy preserved
    // (sin² + cos² = 1 between the two heads).
    {
      const NAME = 'pitch shifter (440 Hz → 880 at +12 · → 659 at +7 · energy preserved)';
      let r;
      try {
        const problems = [];
        const shift = async semis => {
          const ctx = new OfflineAudioContext(1, Math.ceil(SR * 2), SR); await loadWorklets(ctx);
          const osc = ctx.createOscillator(); osc.frequency.value = 440;
          const sh = new AudioWorkletNode(ctx, 'shift-processor', { numberOfInputs: 1, numberOfOutputs: 1, outputChannelCount: [1] });
          sh.parameters.get('semitones').value = semis;
          osc.connect(sh); sh.connect(ctx.destination); osc.start();
          return ctx.startRendering();
        };
        const b12 = await shift(12), b7 = await shift(7);
        const q12 = goertzel(b12, 880, 0.5, 2) / Math.max(1e-9, goertzel(b12, 440, 0.5, 2));
        const q7 = goertzel(b7, 440 * Math.pow(2, 7 / 12), 0.5, 2) / Math.max(1e-9, goertzel(b7, 440, 0.5, 2));
        const e12 = rmsW(b12, 0.5, 2) / Math.SQRT1_2;   // RMS of a sine of amplitude 1 = 0.707
        if (!(q12 > 10)) problems.push('+12: 880 Hz / 440 Hz = ' + q12.toFixed(1) + ' (expected ≫ 1)');
        if (!(q7 > 10)) problems.push('+7: 659 Hz / 440 Hz = ' + q7.toFixed(1) + ' (expected ≫ 1)');
        if (!(e12 > 0.5 && e12 < 1.4)) problems.push('+12: the energy is not preserved (relative RMS ' + e12.toFixed(2) + ')');
        if (analyze(b12).bad) problems.push('NaN/Inf');
        console.log('shifter: +12 880/440', q12.toFixed(1), '· +7 659/440', q7.toFixed(1), '· energy', e12.toFixed(2));
        r = { name: NAME, peak: analyze(b12).peak, ok: !problems.length, problems };
      } catch (e2) { r = { name: NAME, peak: 0, ok: false, problems: ['exception: ' + ((e2 && e2.message) || e2)] }; }
      push(r);
    }
    // Shimmer in the Room: a pluck (Size 4) with and without the loop, on the plate and on the
    // IR. With full shimmer the tail at 3-4 s is brighter (tilt) and MUCH
    // denser (RMS) than without it, and it does not grow (energy per pass 0.8 < 1): at
    // 7-8 s it weighs less than at 2-3 s. The loop gain comes from the energy
    // of the reverb (reverbEnergyGain): it checks that the value computed for
    // the plate at Size 4 reproduces the Node measurement (0.19).
    {
      const NAME = 'shimmer in the Room (plate and IR: the tail brightens and fills up · stable with the loop at full · calibrated gain)';
      let r;
      try {
        const problems = [], meas = {};
        const pl = { waveA: 'sawtooth', levelA: 1, levelB: 0, cutoff: 6000, reso: 0.7, a: 0.002, d: 0.1, s: 0, r: 0.05, width: 0,
                     reverbMix: 0.6, reverbSize: 4, reverbDamp: 0, reverbPre: 0, shimInt: '+12' };
        let peak = 0;
        for (const type of ['plate', 'hall']) {
          loadState({ ...pl, reverbType: type, shimAmt: 0 });
          const b0 = await renderOne(structuredClone(engine.S), { secs: 8, offAt: 0.1 });
          loadState({ ...pl, reverbType: type, shimAmt: 1 });
          const b1 = await renderOne(structuredClone(engine.S), { secs: 8, offAt: 0.1 });
          const t0 = tiltW(b0, 3, 4), t1 = tiltW(b1, 3, 4), e0 = rmsW(b0, 3, 4), e1 = rmsW(b1, 3, 4);
          const growth = rmsW(b1, 7, 8) / Math.max(1e-9, rmsW(b1, 2, 3));
          meas[type] = { t0, t1, e0, e1, growth };
          if (!(e1 > 1e-3 * HR)) problems.push(type + ': no tail with shimmer (' + dB(e1) + ')');
          if (!(t1 > 1.5 * t0)) problems.push(type + ': the shimmer does not brighten the tail (tilt ' + t1.toExponential(2) + ' vs ' + t0.toExponential(2) + ')');
          if (!(e1 > 3 * e0)) problems.push(type + ': the shimmer does not fill the tail (rms ' + dB(e1) + ' vs ' + dB(e0) + ')');
          if (!(growth < 1)) problems.push(type + ': the tail GROWS with the loop at full (×' + growth.toFixed(2) + ' between 2 s and 7 s)');
          const a1 = analyze(b1); peak = Math.max(peak, a1.peak);
          if (a1.bad || a1.peak > 1) problems.push(type + ': NaN/Inf or clipping with shimmer');
        }
        const gP = reverbEnergyGain('plate', 4), gI = reverbEnergyGain('hall', 4);
        if (!(Math.abs(gP - 0.189) < 0.01 && Math.abs(gI - 0.28) < 0.01)) problems.push('reverbEnergyGain at Size 4: plate ' + gP.toFixed(3) + ' (measured 0.189) · IR ' + gI.toFixed(3) + ' (0.280)');
        console.log('shimmer: plate tilt with/without', meas.plate.t1.toExponential(2), meas.plate.t0.toExponential(2), 'rms', dB(meas.plate.e1), dB(meas.plate.e0), '7 s/2 s', meas.plate.growth.toFixed(3),
                    '· IR tilt', meas.hall.t1.toExponential(2), meas.hall.t0.toExponential(2), 'rms', dB(meas.hall.e1), dB(meas.hall.e0), '7 s/2 s', meas.hall.growth.toFixed(3), '· G plate/IR', gP.toFixed(3), gI.toFixed(3));
        r = { name: NAME, peak, ok: !problems.length, problems };
      } catch (e2) { r = { name: NAME, peak: 0, ok: false, problems: ['exception: ' + ((e2 && e2.message) || e2)] }; }
      push(r);
    }
    // Freeze: pluck on a SHORT plate (Size 2); freezing at 0.5 s keeps the tail
    // (at 5 s it weighs as much as at 1 s) while without freezing it has died out; releasing
    // at 3 s lets it fall; with the IR, setFreeze does nothing (there is no state).
    {
      const NAME = 'freeze (the tail stays · release and it falls · plate only)';
      let r;
      try {
        const problems = [];
        const pl = { waveA: 'sawtooth', levelA: 1, levelB: 0, cutoff: 6000, reso: 0.7, a: 0.002, d: 0.1, s: 0, r: 0.05, width: 0,
                     reverbType: 'plate', reverbMix: 0.6, reverbSize: 2, reverbDamp: 0, reverbPre: 0 };
        const rend = async (st, actions) => { loadState(st); const ctx = new OfflineAudioContext(2, Math.ceil(SR * 6), SR);
          const eng = new AudioEngine(); eng.S = structuredClone(engine.S); await eng.init(ctx);
          eng.noteOn('f', NOTE1); ctx.suspend(0.1).then(() => { eng.noteOff('f'); ctx.resume(); });
          for (const [t, fn] of actions) ctx.suspend(t).then(() => { fn(eng); ctx.resume(); });
          return ctx.startRendering(); };
        const bFree = await rend(pl, []);
        const bFrz = await rend(pl, [[0.5, e => { if (!e.room.setFreeze(true)) problems.push('setFreeze(true) did not act with the plate'); }]]);
        const bReleased = await rend(pl, [[0.5, e => e.room.setFreeze(true)], [3.0, e => e.room.setFreeze(false)]]);
        let irOk = true;
        await rend({ ...pl, reverbType: 'hall' }, [[0.5, e => { irOk = e.room.setFreeze(true) === false && !e.room.frozen; }]]);
        const hold = rmsW(bFrz, 5, 5.5) / Math.max(1e-9, rmsW(bFrz, 1, 1.5)), free = rmsW(bFree, 5, 5.5) / Math.max(1e-9, rmsW(bFree, 1, 1.5));
        const drop = rmsW(bReleased, 5.5, 6) / Math.max(1e-9, rmsW(bReleased, 2.5, 3));
        if (!(rmsW(bFrz, 5, 5.5) > 1e-3)) problems.push('frozen, the tail dies out (' + dB(rmsW(bFrz, 5, 5.5)) + ' at 5 s)');
        if (!(hold > 0.6 && hold < 1.5)) problems.push('frozen, the tail does not hold (5 s / 1 s = ' + hold.toFixed(3) + ')');
        if (!(free < 0.05)) problems.push('without freezing, the Size 2 tail should have died out (5 s / 1 s = ' + free.toFixed(3) + ')');
        if (!(drop < 0.2)) problems.push('on release it does not fall (6 s / 3 s = ' + drop.toFixed(3) + ')');
        if (!irOk) problems.push('with the IR, setFreeze should do nothing');
        if (analyze(bFrz).bad || analyze(bFrz).peak > 1) problems.push('NaN/Inf or clipping while frozen');
        console.log('freeze: 5 s / 1 s frozen', hold.toFixed(3), '· free', free.toExponential(2), '· after release 6 s / 3 s', drop.toExponential(2));
        r = { name: NAME, peak: analyze(bFrz).peak, ok: !problems.length, problems };
      } catch (e2) { r = { name: NAME, peak: 0, ok: false, problems: ['exception: ' + ((e2 && e2.message) || e2)] }; }
      push(r);
    }
  }

  // ---------- Roadmap 5.0 · block 4: performance sources ----------
  // Wheel, aftertouch and expression as matrix sources (0..1 per engine). The
  // value is set through the API (setPerf) before the note and the effect is measured through the
  // real path: wheel → cutoff opens (tilt), aftertouch → pitch rises 600 ct (zero
  // crossings), expression → amplitude at −0.8 leaves 20 %. And synthetic MIDI (CC1,
  // channel pressure, CC11) reaches the live engine's sources; the on-screen wheel
  // follows CC1.
  {
    body.appendChild(el('st-cat', 'Performance sources'));
    const NAME = 'performance sources (wheel → cutoff · aftertouch → pitch 600 ct · expression → amplitude · MIDI CC1/pressure/CC11 · the wheel follows CC1)';
    let r;
    try {
      const problems = [];
      const rmsW = (buf, t0, t1) => { const d = buf.getChannelData(0), i0 = Math.floor(t0 * SR), i1 = Math.min(d.length, Math.floor(t1 * SR));
        let s = 0; for (let i = i0; i < i1; i++) s += d[i] * d[i]; return Math.sqrt(s / Math.max(1, i1 - i0)); };
      const hzOf = (buf, t0, t1) => { const d = buf.getChannelData(0), i0 = Math.floor(t0 * SR), i1 = Math.min(d.length, Math.floor(t1 * SR));
        let n = 0; for (let i = i0 + 1; i < i1; i++) if ((d[i - 1] < 0) !== (d[i] < 0)) n++; return n / 2 / ((i1 - i0) / SR); };
      const perfRender = async (st, id, v, secs = 1.2) => { loadState(st); const ctx = new OfflineAudioContext(2, Math.ceil(SR * secs), SR);
        const eng = new AudioEngine(); eng.S = structuredClone(engine.S); await eng.init(ctx); eng.setPerf(id, v);
        eng.noteOn('p', NOTE1); return ctx.startRendering(); };
      const saw = { waveA: 'sawtooth', levelA: 1, levelB: 0, cutoff: 400, reso: 0.7, filterSlope: '24', a: 0.005, d: 0.05, s: 1, r: 0.05, width: 0, amplitude: 0.3, master: 0.4 };
      const w0 = await perfRender({ ...saw, mx1src: 'wheel', mx1dst: 'cutoff', mx1amt: 0.6 }, 'wheel', 0);
      const w1 = await perfRender({ ...saw, mx1src: 'wheel', mx1dst: 'cutoff', mx1amt: 0.6 }, 'wheel', 1);
      const tw = tiltW(w1, 0.3, 1.1) / Math.max(1e-12, tiltW(w0, 0.3, 1.1));
      if (!(tw > 3)) problems.push('the wheel does not open the filter (tilt ×' + tw.toFixed(2) + ')');
      const sine = { waveA: 'sine', levelA: 1, levelB: 0, cutoff: 20000, reso: 0.7, a: 0.005, d: 0.05, s: 1, r: 0.05, width: 0, amplitude: 0.3, master: 0.4 };
      const atB = await perfRender({ ...sine, mx1src: 'at', mx1dst: 'pitch', mx1amt: 0.5 }, 'at', 1);
      const fAt = hzOf(atB, 0.3, 1.1), fExp = NOTE1 * Math.pow(2, 0.5);
      if (!(Math.abs(fAt - fExp) < 2.5)) problems.push('aftertouch does not raise the pitch 600 ct (' + fAt.toFixed(1) + ' Hz, expected ' + fExp.toFixed(1) + ')');
      const e0 = await perfRender({ ...sine, mx1src: 'expr', mx1dst: 'amp', mx1amt: -0.8 }, 'expr', 0);
      const e1 = await perfRender({ ...sine, mx1src: 'expr', mx1dst: 'amp', mx1amt: -0.8 }, 'expr', 1);
      const qe = rmsW(e1, 0.3, 1.1) / Math.max(1e-9, rmsW(e0, 0.3, 1.1));
      if (!(qe > 0.15 && qe < 0.25)) problems.push('expression does not attenuate (×' + qe.toFixed(3) + ', expected 0.20)');
      // synthetic MIDI on the live engine (no device): CC1 at full, pressure 64, CC11 at 0
      handleMidi([0xb0, 1, 127]); handleMidi([0xd0, 64]); handleMidi([0xb0, 11, 0]);
      const pv = { ...engine.perfVal }, wheelEl = document.getElementById('kbWheel');
      if (!(pv.wheel === 1 && Math.abs(pv.at - 64 / 127) < 1e-9 && pv.expr === 0)) problems.push('MIDI → sources: ' + JSON.stringify(pv));
      if (wheelEl && +wheelEl.value !== 1) problems.push('the on-screen wheel does not follow CC1 (' + wheelEl.value + ')');
      handleMidi([0xb0, 1, 0]); handleMidi([0xd0, 0]);   // rest
      loadState({});
      console.log('performance: wheel tilt x', tw.toFixed(2), '· aftertouch', fAt.toFixed(1), 'Hz (expected', fExp.toFixed(1) + ')', '· expression x', qe.toFixed(3), '· MIDI', JSON.stringify(pv));
      r = { name: NAME, peak: analyze(w1).peak, ok: !problems.length, problems };
    } catch (e2) { r = { name: NAME, peak: 0, ok: false, problems: ['exception: ' + ((e2 && e2.message) || e2)] }; }
    push(r);
  }

  // Macros (Roadmap 7.0 · 2.5): preset knobs as matrix sources. (1) a
  // single knob to several targets: Macro 1 → pitch +0.5 (600 ct) and → amplitude −0.5 in
  // two slots; with the macro at 1 the note rises 600 ct and drops to half, at 0 it sounds
  // as without the matrix; (2) Macro 2 → cutoff opens the filter; (3) the knob reaches the live
  // engine and is saved in the preset (snapshot), and the matrix offers them as sources;
  // (4) with no slot using it, the knob is dimmed with its reason (deps).
  {
    const NAME = 'macros (one knob, several targets · cutoff · to the engine and the preset · matrix sources · dimmed if nobody uses them)';
    let r;
    try {
      const problems = [];
      const rmsW = (buf, t0, t1) => { const d = buf.getChannelData(0), i0 = Math.floor(t0 * SR), i1 = Math.min(d.length, Math.floor(t1 * SR));
        let s = 0; for (let i = i0; i < i1; i++) s += d[i] * d[i]; return Math.sqrt(s / Math.max(1, i1 - i0)); };
      const hzOf = (buf, t0, t1) => { const d = buf.getChannelData(0), i0 = Math.floor(t0 * SR), i1 = Math.min(d.length, Math.floor(t1 * SR));
        let n = 0; for (let i = i0 + 1; i < i1; i++) if ((d[i - 1] < 0) !== (d[i] < 0)) n++; return n / 2 / ((i1 - i0) / SR); };
      const render = async st => { loadState(st); const ctx = new OfflineAudioContext(2, Math.ceil(SR * 1.2), SR);
        const eng = new AudioEngine(); eng.S = structuredClone(engine.S); await eng.init(ctx); eng.noteOn('m', NOTE1); return ctx.startRendering(); };
      const keep = snapshot();
      const sine = { waveA: 'sine', levelA: 1, levelB: 0, cutoff: 20000, reso: 0.7, a: 0.005, d: 0.05, s: 1, r: 0.05, width: 0, amplitude: 0.3, master: 0.4,
        mx1src: 'mac1', mx1dst: 'pitch', mx1amt: 0.5, mx2src: 'mac1', mx2dst: 'amp', mx2amt: -0.5 };
      const s0 = await render({ ...sine, macro1: 0 }), s1 = await render({ ...sine, macro1: 1 });
      const f0 = hzOf(s0, 0.3, 1.1), f1 = hzOf(s1, 0.3, 1.1), fExp = NOTE1 * Math.pow(2, 0.5), q = rmsW(s1, 0.3, 1.1) / Math.max(1e-9, rmsW(s0, 0.3, 1.1));
      if (!(Math.abs(f0 - NOTE1) < 2.5)) problems.push('at 0 the macro already moves the pitch (' + f0.toFixed(1) + ' Hz)');
      if (!(Math.abs(f1 - fExp) < 2.5)) problems.push('Macro 1 does not raise the pitch 600 ct (' + f1.toFixed(1) + ' Hz, expected ' + fExp.toFixed(1) + ')');
      if (!(q > 0.45 && q < 0.55)) problems.push('Macro 1 does not halve the amplitude (×' + q.toFixed(3) + ')');
      const saw = { waveA: 'sawtooth', levelA: 1, levelB: 0, cutoff: 400, reso: 0.7, filterSlope: '24', a: 0.005, d: 0.05, s: 1, r: 0.05, width: 0, amplitude: 0.3, master: 0.4,
        mx1src: 'mac2', mx1dst: 'cutoff', mx1amt: 0.6 };
      const c0 = await render({ ...saw, macro2: 0 }), c1 = await render({ ...saw, macro2: 1 });
      const tw = tiltW(c1, 0.3, 1.1) / Math.max(1e-12, tiltW(c0, 0.3, 1.1));
      if (!(tw > 3)) problems.push('Macro 2 does not open the filter (tilt ×' + tw.toFixed(2) + ')');
      // to the live engine, to the preset and to the source list
      loadState({ mx1src: 'mac2', mx1dst: 'cutoff', mx1amt: 0.5, macro2: 0.7 });
      if (engine.S.macro2 !== 0.7 || snapshot().macro2 !== 0.7) problems.push('macro2 does not reach the engine or the preset (' + engine.S.macro2 + ' / ' + snapshot().macro2 + ')');
      const opts = [...document.querySelectorAll('#mxRows select')].flatMap(s => [...s.options].map(o => o.textContent));
      if (!opts.includes('Macro 1') || !opts.includes('Macro 2')) problems.push('the matrix does not offer Macro 1 / Macro 2');
      // deps: unused Macro 1 → dimmed with a reason; Macro 2 in use → live
      const k1 = document.querySelector('[data-knob="macro1"]')?.closest('.ctl'), k2 = document.querySelector('[data-knob="macro2"]')?.closest('.ctl');
      await new Promise(res => setTimeout(res, 50));
      const off = e => !!e && (!!e.closest('.dep-off') || !!e.querySelector('.dep-off'));
      if (!k1 || !k2) problems.push('the macro knobs are missing');
      else if (!off(k1) || off(k2)) problems.push('dimmed: unused Macro 1 ' + off(k1) + ' · Macro 2 in use ' + off(k2));
      loadState(keep);
      console.log('macros: pitch at 0 / at 1 ' + f0.toFixed(1) + ' / ' + f1.toFixed(1) + ' Hz (expected ' + fExp.toFixed(1) + ') · amplitude ×' + q.toFixed(3) + ' · Macro 2 → cutoff tilt ×' + tw.toFixed(2));
      r = { name: NAME, peak: analyze(c1).peak, ok: !problems.length, problems };
    } catch (e2) { r = { name: NAME, peak: 0, ok: false, problems: ['exception: ' + ((e2 && e2.message) || e2)] }; }
    push(r);
  }

  {
    // Touch response (Roadmap 7.0 · 2.6). (1) Velocity curve, the player's (not the
    // preset's): soft v^0.5 · linear · hard v^2, through the real path — a MIDI note with
    // velocity 64 is born with (64/127)^γ, and the mouse applies it to the press height
    // keeping the floor (0.2); the buttons mark the chosen one and it is remembered. (2) Bend
    // range, the preset's: with the bend at full, ±12 rises an exact octave and ±2 a whole tone;
    // changing the range with the wheel moved rescales the bend live.
    const NAME = 'touch response (soft/linear/hard curve on MIDI and mouse · bend range from the preset · rescales live)';
    let r;
    try {
      const problems = [], keep = snapshot(), tk = getTouch(), near = (a, b, e = 1e-6) => Math.abs(a - b) < e;
      loadState({});
      const v64 = 64 / 127;
      for (const [t, g] of [['soft', 0.5], ['linear', 1], ['hard', 2]]) {
        setTouch(t);
        handleMidi([0x90, 60, 64]);
        const v = part().voices.get('m60');
        handleMidi([0x80, 60, 0]);
        if (!v || !near(v.vel, Math.pow(v64, g), 1e-6)) problems.push(t + ': MIDI 64 is born with vel ' + (v ? v.vel.toFixed(3) : '—') + ' (expected ' + Math.pow(v64, g).toFixed(3) + ')');
        const m = velFromY(0.425), mExp = 0.2 + 0.8 * Math.pow(0.5, g);
        if (!near(m, mExp)) problems.push(t + ': mouse at mid-key ' + m.toFixed(3) + ' (expected ' + mExp.toFixed(3) + ')');
        if (!near(velFromY(0), 0.2) || !near(velFromY(1), 1)) problems.push(t + ': the mouse loses the floor or the ceiling');
        const act = [...document.querySelectorAll('#kbTouch button.active')].map(b => b.dataset.touch);
        if (act.join() !== t) problems.push(t + ': buttons marked ' + (act.join() || 'none'));
        let saved = null; try { saved = localStorage.getItem('subsdj.touch.v2'); } catch (_) {}
        if (saved !== t) problems.push(t + ': not remembered (' + saved + ')');
      }
      part().allNotesOff();
      setTouch(tk);
      // bend range: offline, sine, bend at full
      const hzOf = (buf, t0, t1) => { const d = buf.getChannelData(0), i0 = Math.floor(t0 * SR), i1 = Math.min(d.length, Math.floor(t1 * SR));
        let n = 0; for (let i = i0 + 1; i < i1; i++) if ((d[i - 1] < 0) !== (d[i] < 0)) n++; return n / 2 / ((i1 - i0) / SR); };
      const sine = { waveA: 'sine', levelA: 1, levelB: 0, cutoff: 20000, reso: 0.7, a: 0.005, d: 0.05, s: 1, r: 0.05, width: 0, amplitude: 0.3, master: 0.4 };
      const bendRender = async range => { loadState({ ...sine, bendRange: range }); const ctx = new OfflineAudioContext(2, Math.ceil(SR * 1.2), SR);
        const eng = new AudioEngine(); eng.S = structuredClone(engine.S); await eng.init(ctx); eng.setBend(1); eng.noteOn('b', NOTE1); return ctx.startRendering(); };
      const f12 = hzOf(await bendRender('12'), 0.3, 1.1), f2 = hzOf(await bendRender('2'), 0.3, 1.1);
      if (!(Math.abs(f12 - 2 * NOTE1) < 2.5)) problems.push('±12 with the bend at full: ' + f12.toFixed(1) + ' Hz (expected ' + (2 * NOTE1).toFixed(1) + ')');
      if (!(Math.abs(f2 - NOTE1 * Math.pow(2, 2 / 12)) < 2.5)) problems.push('±2 with the bend at full: ' + f2.toFixed(1) + ' Hz (expected ' + (NOTE1 * Math.pow(2, 2 / 12)).toFixed(1) + ')');
      // live: MIDI arrives normalized and the range scales it; changing the range rescales
      loadState({ bendRange: '2' });
      handleMidi([0xe0, 0x00, 0x60]);                       // +0,5 (8192 + 4096)
      const b2 = engine._bend;
      CONTROLS.bendRange.set('12');
      const b12 = engine._bend;
      handleMidi([0xe0, 0x00, 0x40]);                       // center
      if (!near(b2, 100, 1e-6) || !near(b12, 600, 1e-6) || engine._bend !== 0) problems.push('live bend: ' + b2 + ' → ' + b12 + ' ct (expected 100 → 600) · on centering ' + engine._bend);
      loadState(keep);
      console.log('touch: MIDI 64 soft/linear/hard ' + [0.5, 1, 2].map(g => Math.pow(v64, g).toFixed(3)).join('/') + ' · bend at full ±12 ' + f12.toFixed(1) + ' Hz · ±2 ' + f2.toFixed(1) + ' Hz · live ' + b2 + ' → ' + b12 + ' ct');
      r = { name: NAME, peak: 0, ok: !problems.length, problems };
    } catch (e2) { r = { name: NAME, peak: 0, ok: false, problems: ['exception: ' + ((e2 && e2.message) || e2)] }; }
    push(r);
  }
  // ---------- Roadmap 5.0 · block 7: tape on the master ----------
  // Saturation: a C3 sine gains a 3rd harmonic (392 Hz) at full and has none at 0,
  // without jumping in level; and at 0.3 (the «a little» zone of the knob, which goes in
  // squared) it is still color, not clipping: 3rd harmonic < 2 %. Wow: a 440 Hz
  // sine wanders more than 5 Hz (instantaneous frequency from interpolated zero
  // crossings, smoothed over 20 periods) and without wow it stays still. And both
  // are Room keys.
  {
    body.appendChild(el('st-cat', 'Tape on the master'));
    const NAME = 'tape on the master (saturation: harmonics without a level jump, gentle at 0.3 · wow: the pitch wanders · Room keys)';
    let r;
    try {
      const problems = [];
      const rmsW = (buf, t0, t1) => { const d = buf.getChannelData(0), i0 = Math.floor(t0 * SR), i1 = Math.min(d.length, Math.floor(t1 * SR));
        let s = 0; for (let i = i0; i < i1; i++) s += d[i] * d[i]; return Math.sqrt(s / Math.max(1, i1 - i0)); };
      const goertzel = (buf, f, t0, t1) => { const d = buf.getChannelData(0), i0 = Math.floor(t0 * SR), i1 = Math.min(d.length, Math.floor(t1 * SR)), N = i1 - i0;
        const c = 2 * Math.cos(2 * Math.PI * f / SR); let s1 = 0, s2 = 0;
        for (let i = i0; i < i1; i++) { const s0 = d[i] + c * s1 - s2; s2 = s1; s1 = s0; }
        return Math.sqrt(Math.max(0, s1 * s1 + s2 * s2 - c * s1 * s2)) / N; };
      const instFreq = (buf, t0, t1, avg = 20) => { const d = buf.getChannelData(0), i0 = Math.floor(t0 * SR), i1 = Math.min(d.length, Math.floor(t1 * SR)), cross = [];
        for (let i = i0 + 1; i < i1; i++) if (d[i - 1] < 0 && d[i] >= 0) cross.push(i - 1 + (-d[i - 1]) / (d[i] - d[i - 1]));
        const f = []; for (let k = avg; k < cross.length; k++) f.push(SR * avg / (cross[k] - cross[k - avg])); return f; };
      const spread = f => f.length ? Math.max(...f) - Math.min(...f) : NaN;
      const one = async (st, freq, secs) => { loadState(st); const ctx = new OfflineAudioContext(2, Math.ceil(SR * secs), SR);
        const eng = new AudioEngine(); eng.S = structuredClone(engine.S); await eng.init(ctx); if (freq) eng.noteOn('c', freq); return ctx.startRendering(); };
      const sine = { waveA: 'sine', levelA: 1, levelB: 0, cutoff: 20000, reso: 0.7, a: 0.005, d: 0.05, s: 1, r: 0.05, width: 0 };
      const h3 = buf => goertzel(buf, 3 * NOTE1, 0.3, 1.1) / Math.max(1e-9, goertzel(buf, NOTE1, 0.3, 1.1));
      const s0 = await one({ ...sine, tapeSat: 0 }, NOTE1, 1.2), s1 = await one({ ...sine, tapeSat: 1 }, NOTE1, 1.2), sM = await one({ ...sine, tapeSat: 0.3 }, NOTE1, 1.2);
      const h0 = h3(s0), h1 = h3(s1), hM = h3(sM);
      const lvl = rmsW(s1, 0.3, 1.1) / Math.max(1e-9, rmsW(s0, 0.3, 1.1));
      if (!(h0 < 0.003)) problems.push('at saturation 0 there is a 3rd harmonic (' + h0.toFixed(4) + '): it is not transparent');
      if (!(h1 > 0.03)) problems.push('at saturation 1 the 3rd harmonic does not appear (' + h1.toFixed(4) + ')');
      if (!(hM < 0.02)) problems.push('at saturation 0.3 it already clips (3rd harmonic ' + hM.toFixed(4) + ', it must be color: < 2 %)');
      if (!(lvl > 0.6 && lvl < 1.5)) problems.push('the saturation changes the level (×' + lvl.toFixed(2) + ')');
      const w0 = await one({ ...sine, tapeWow: 0 }, 440, 3), w1 = await one({ ...sine, tapeWow: 1 }, 440, 3);
      const sp0 = spread(instFreq(w0, 0.5, 3)), sp1 = spread(instFreq(w1, 0.5, 3));
      if (!(sp0 < 0.05)) problems.push('without wow the pitch wanders (' + sp0.toFixed(3) + ' Hz)');
      if (!(sp1 > 8)) problems.push('with wow the pitch does not wander enough (' + sp1.toFixed(2) + ' Hz, expected > 8 ≈ ±15 ct)');
      // the KNOB path: the Room is born with wow 0 and it is raised to 1 live (set → smooth); from 0.6 s on it must wander the same
      loadState({ ...sine, tapeWow: 0 });
      const ctxK = new OfflineAudioContext(2, Math.ceil(SR * 3), SR), engK = new AudioEngine(); engK.S = structuredClone(engine.S); await engK.init(ctxK);
      engK.noteOn('k', 440); ctxK.suspend(0.2).then(() => { engK.set('tapeWow', 1); ctxK.resume(); });
      const wK = await ctxK.startRendering(), spK = spread(instFreq(wK, 0.8, 3));
      if (!(spK > 8)) problems.push('raising the wow LIVE (set) the pitch does not wander (' + spK.toFixed(2) + ' Hz)');
      if (!(['tapeSat', 'tapeWow'].every(k => ROOM_KEYS.has(k)))) problems.push('the tape keys are not Room keys');
      loadState({});
      console.log('tape: 3rd harmonic at 0 / 0.3 / 1', h0.toFixed(4), hM.toFixed(4), h1.toFixed(4), '· level x', lvl.toFixed(2), '· wow Hz without/with/live', sp0.toFixed(3), sp1.toFixed(2), spK.toFixed(2));
      r = { name: NAME, peak: analyze(s1).peak, ok: !problems.length, problems };
    } catch (e2) { r = { name: NAME, peak: 0, ok: false, problems: ['exception: ' + ((e2 && e2.message) || e2)] }; }
    push(r);
  }

  // ---------- Roadmap 5.0 · block 5: modal resonator ----------
  // Tables (string and bar ratios, Q, normalized gains); then noise +
  // sine at C3 through the bank (wet 1) and, with the note still held (the VCA comes after the
  // bank: releasing it would measure the release), the NOISE IS CUT: what keeps sounding is
  // the modes, and that free tail is measured. Measuring the noise itself is no good: a Goertzel
  // over noise is a Rayleigh draw (2 degrees of freedom, lengthening the window does not
  // average it out) and the ratio of two draws failed ~7 % of the runs (measured with
  // 30 repetitions, Oct 2026). The tail is deterministic in its RATE, τ = Q/(π·f): the
  // noise decides how strongly each mode starts, not how it dies away.
  // Material 0 → after the cut it sings at 2·f0 and not at 2.756·f0; 1 → the other way round. Decay 1 (Q 600)
  // → measured τ = theoretical in both; Decay 0 (Q 10) → dead at 0.15 s. The bowl
  // with noise SOUNDS (boost ∝ √Q); and in mono the bank follows the glide (after C3 → G3
  // the tail sings at 2·G3 and not at 2·C3).
  {
    body.appendChild(el('st-cat', 'Resonator'));
    const NAME = 'modal resonator (tables · string↔bar material, also through the matrix · Decay = tail τ · the bowl with noise sounds · follows the glide)';
    let r;
    try {
      const problems = [];
      const CUT = 1, RING = [CUT + 0.15, CUT + 0.55];   // s: noise cut and tail window (0.4 s: 2.5 Hz bins, the leakage of 3·f0 does not reach 2.756·f0)
      const rmsW = (buf, t0, t1) => { const d = buf.getChannelData(0), i0 = Math.floor(t0 * SR), i1 = Math.min(d.length, Math.floor(t1 * SR));
        let s = 0; for (let i = i0; i < i1; i++) s += d[i] * d[i]; return Math.sqrt(s / Math.max(1, i1 - i0)); };
      // Goertzel with a Hann window: the leakage of the sine at f0 into 2·f0 drops to ~−75 dB
      const hannG = (buf, f, t0, t1) => { const d = buf.getChannelData(0), i0 = Math.floor(t0 * SR), N = Math.min(d.length, Math.floor(t1 * SR)) - i0;
        const c = 2 * Math.cos(2 * Math.PI * f / SR); let s1 = 0, s2 = 0;
        for (let i = 0; i < N; i++) { const s0 = d[i0 + i] * (0.5 - 0.5 * Math.cos(2 * Math.PI * i / (N - 1))) + c * s1 - s2; s2 = s1; s1 = s0; }
        return Math.sqrt(Math.max(0, s1 * s1 + s2 * s2 - c * s1 * s2)) / N; };
      const ring = (buf, fa, fb, [t0, t1] = RING) => 20 * Math.log10(hannG(buf, fa, t0, t1) / (hannG(buf, fb, t0, t1) + 1e-12));   // dB: fa sings and fb does not
      const tauAt = (buf, f) => {                        // regression of ln|A| over 0.1 s windows after the cut: slope = −1/τ
        const xs = [], ys = [];
        for (let t = CUT + 0.15; t + 0.1 <= CUT + 1.45; t += 0.05) { xs.push(t + 0.05); ys.push(Math.log(hannG(buf, f, t, t + 0.1) + 1e-12)); }
        const n = xs.length, mx = xs.reduce((a, b) => a + b) / n, my = ys.reduce((a, b) => a + b) / n;
        let sxy = 0, sxx = 0; for (let i = 0; i < n; i++) { sxy += (xs[i] - mx) * (ys[i] - my); sxx += (xs[i] - mx) ** 2; }
        return -sxx / sxy; };
      const rh = resRatios(0), rb = resRatios(1), gg = resGains(rb, 0.5), e2 = gg.reduce((a, x) => a + x * x, 0);
      if (!(rh.every((x, i) => Math.abs(x - (i + 1)) < 1e-9) && Math.abs(rb[1] - 2.756) < 1e-9 && Math.abs(rb[5] - 18.638) < 1e-9)) problems.push('ratios: ' + rh.map(x => x.toFixed(2)).join(',') + ' / ' + rb.map(x => x.toFixed(2)).join(','));
      if (!(Math.abs(resQ(0) - 10) < 1e-9 && Math.abs(resQ(1) - 600) < 1e-6)) problems.push('resQ: ' + resQ(0) + ' ' + resQ(1));
      if (!(Math.abs(e2 - 2) < 1e-9)) problems.push('gains not normalized (Σg² = ' + e2.toFixed(3) + ')');
      const ex = { waveA: 'sine', levelA: 1, levelB: 0, noise: 1, cutoff: 20000, reso: 0.7, a: 0.005, d: 0.05, s: 1, r: 0.05, width: 0, resAmt: 1, resDecay: 1, resBright: 0.6 };
      const rendCut = async (st, { cut = CUT, legato = 0 } = {}) => {   // noise + sine; at `cut` the noise is cut with the note held
        loadState(st);
        const ctx = new OfflineAudioContext(2, Math.ceil(SR * (CUT + 1.6)), SR), eng = new AudioEngine(); eng.S = structuredClone(engine.S); await eng.init(ctx);
        eng.noteOn('t1', NOTE1);
        if (legato) ctx.suspend(0.5).then(() => { eng.noteOn('t2', legato); ctx.resume(); });
        ctx.suspend(cut).then(() => { eng.set('noise', 0); ctx.resume(); });
        return ctx.startRendering();
      };
      const bH = await rendCut({ ...ex, resMat: 0 }), bB = await rendCut({ ...ex, resMat: 1 });
      const rH = ring(bH, 2 * NOTE1, 2.756 * NOTE1), rB = ring(bB, 2.756 * NOTE1, 2 * NOTE1);
      if (!(rH > 30)) problems.push('string: the tail does not sing at 2·f0 (2f0 over 2.76f0 = ' + rH.toFixed(1) + ' dB, expected > 30)');
      if (!(rB > 30)) problems.push('bar: the tail does not sing at 2.76·f0 (2.76f0 over 2f0 = ' + rB.toFixed(1) + ' dB, expected > 30)');
      // Material through the matrix (Roadmap 7.0 · 2.4): knob at 0 and +1 through the matrix = bar tuning
      // (the mode weights follow the knob's: the matrix only retunes them)
      const bM = await rendCut({ ...ex, resMat: 0, mx1src: 'vel', mx1dst: 'resMat', mx1amt: 1 }), rM = ring(bM, 2.756 * NOTE1, 2 * NOTE1);
      if (!(rM > 30)) problems.push('Material through the matrix: the tail does not sing at 2.76·f0 (over 2f0 = ' + rM.toFixed(1) + ' dB, expected > 30)');
      const tH = tauAt(bH, 2 * NOTE1), tB = tauAt(bB, 2.756 * NOTE1);
      const eH = resQ(1) / (Math.PI * 2 * NOTE1), eB = resQ(1) / (Math.PI * 2.756 * NOTE1);
      if (!(Math.abs(tH / eH - 1) < 0.05 && Math.abs(tB / eB - 1) < 0.05))
        problems.push('Decay 1 (Q 600): tail τ ' + tH.toFixed(3) + ' / ' + tB.toFixed(3) + ' s, expected Q/(π·f) = ' + eH.toFixed(3) + ' / ' + eB.toFixed(3));
      const bQ0 = await rendCut({ ...ex, resMat: 0, resDecay: 0 });
      const drop0 = 20 * Math.log10(hannG(bQ0, 2 * NOTE1, CUT + 0.15, CUT + 0.25) / (hannG(bQ0, 2 * NOTE1, CUT - 0.15, CUT - 0.05) + 1e-12));
      if (!(drop0 < -30)) problems.push('Decay 0 (Q 10): the mode keeps sounding after the noise is cut (' + drop0.toFixed(1) + ' dB at 0.15 s, expected < −30)');
      // level WITHOUT the master headroom (HR, 1.1.0): with it included the median fell at −28 dB and the noise
      // at Q 600 (a 0.4 Hz band: almost a draw) pushed some runs below −30 (measured: −30.0…−27.1 over 20)
      const lvl = rmsW(bH, 0.5, CUT) / HR;
      if (!(lvl > 0.03 && lvl < 0.7)) problems.push('level of the bowl with noise out of range (' + dB(lvl) + ' without the headroom, expected −30…−3 dB)');
      if (analyze(bH).bad || analyze(bH).peak > 1) problems.push('NaN/Inf or clipping at Q 600');
      const bG = await rendCut({ ...ex, resMat: 0, mode: 'mono', glide: 0.2 }, { cut: 1.2, legato: NOTE2 });
      const rG = ring(bG, 2 * NOTE2, 2 * NOTE1, [1.35, 1.75]);   // 2·G3 is a mode after the glide; 2·C3 no longer is (and it is not a mode of G3)
      if (!(rG > 30)) problems.push('the bank does not follow the glide (the tail at 2·G3 over 2·C3 = ' + rG.toFixed(1) + ' dB, expected > 30)');
      loadState({});
      console.log('resonator: tail 2f0/2.76f0 string', rH.toFixed(1), 'dB · 2.76f0/2f0 bar', rB.toFixed(1), 'dB · through the matrix', rM.toFixed(1), 'dB · τ Q600', tH.toFixed(3), tB.toFixed(3),
        's (Q/πf', eH.toFixed(3), eB.toFixed(3) + ') · Q10 at 0.15 s', drop0.toFixed(1), 'dB · bowl level', dB(lvl), '· glide', rG.toFixed(1), 'dB');
      r = { name: NAME, peak: analyze(bB).peak, ok: !problems.length, problems };
    } catch (e2) { r = { name: NAME, peak: 0, ok: false, problems: ['exception: ' + ((e2 && e2.message) || e2)] }; }
    push(r);
  }

  {
    // Mono trigger (monoTrig) and SCHEDULED note-offs of the arp/Seq. The real
    // scheduler is simulated on the audio clock: the render is suspended every
    // 25 ms and calls _tick() (the live setInterval), with its 120 ms
    // look-ahead. A pluck (sustain 0) makes each retrigger audible: the
    // attacks are counted. Before, at 1/16 the note-offs (on a timer) arrived
    // AFTER the next on: the engine took it as legato and only the
    // first step sounded — the overlap depending on the tempo and not on the gate was the bug.
    // Also: the keyboard in «Retrig» retriggers with no gap (handover at the
    // same instant), and a gate shorter than the look-ahead SOUNDS (before, the
    // note-off landed before the start: the players' mute hit).
    body.appendChild(el('st-cat', 'Mono trigger'));
    let r;
    try {
      const problems = [], log = [], keep = snapshot();
      // RMS over 8 ms windows every 2 ms: the window has to span a whole period
      // of C3 (7.6 ms); with 2 ms the RMS of the saw swings ×5 within the note
      const HOP = 0.002, env = buf => {
        const d = buf.getChannelData(0), W = Math.round(SR * 0.008), H = Math.round(SR * HOP), out = [];
        for (let i = 0; i + W <= d.length; i += H) { let s = 0; for (let k = i; k < i + W; k++) s += d[k] * d[k]; out.push(Math.sqrt(s / W)); }
        return out;
      };
      const attacks = buf => {                   // upward crossings of −20 dB below the peak (hysteresis at −26 dB)
        const e = env(buf), top = Math.max(...e), t = [];
        let up = false;
        e.forEach((v, i) => { if (!up && v > top * 0.1) { up = true; t.push(i * HOP); } else if (up && v < top * 0.05) up = false; });
        return t;
      };
      const pluck = { mode: 'mono', waveA: 'sawtooth', levelA: 1, levelB: 0, cutoff: 20000, reso: 0.7, a: 0.001, d: 0.04, s: 0, r: 0.03, width: 0, bpm: 120 };
      loadState(pluck);
      const P = structuredClone(engine.S);
      // arp or Seq with one key; 1/16 at 120 BPM = 125 ms steps → 8 steps from 0.03 s to 0.905 s
      const sched = async (over, kind) => {
        const S = { ...structuredClone(P), ...over };
        const c = new OfflineAudioContext(2, Math.ceil(SR * 1.4), SR);
        const eng = new AudioEngine(); eng.S = S; await eng.init(c);
        const q = kind === 'seq' ? eng.seq : eng.arp;
        q.held = [{ id: 'k', freq: NOTE1, vel: 1 }]; q._begin(0.03); q.timer = 'sim';   // like a key at 0.03 s (joins the common clock)
        for (let i = 1; i * 0.025 < 0.9; i++) c.suspend(i * 0.025).then(() => { q._tick(); c.resume(); });
        c.suspend(0.95).then(() => { q.held = []; q._maybeStop(); c.resume(); });
        return c.startRendering();
      };
      const cases = [
        ['arp · legato · gate 0.5', { arpMode: 'up', arpDiv: '1/16', arpGate: 0.5, monoTrig: 'legato' }, 'arp', 8],
        ['arp · legato · gate 1 (tie)', { arpMode: 'up', arpDiv: '1/16', arpGate: 1, monoTrig: 'legato' }, 'arp', 1],
        ['arp · retrig · gate 1', { arpMode: 'up', arpDiv: '1/16', arpGate: 1, monoTrig: 'retrig' }, 'arp', 8],
        ['Seq · legato · gate 0.6', { seqOn: 'on', seqPat: '0 3 7 12', seqDiv: '1/16', seqGate: 0.6, monoTrig: 'legato' }, 'seq', 8],
        ['Seq · legato · gate 1 (tie)', { seqOn: 'on', seqPat: '0 3 7 12', seqDiv: '1/16', seqGate: 1, monoTrig: 'legato' }, 'seq', 1],
      ];
      let gaps = [];
      for (const [label, over, kind, want] of cases) {
        const b = await sched(over, kind), at = attacks(b);
        log.push(label + ' ' + at.length);
        if (at.length !== want) problems.push(label + ': ' + at.length + ' attacks (expected ' + want + ')');
        if (want === 8 && at.length === 8 && !gaps.length) gaps = at.slice(1).map((t, i) => t - at[i]);
      }
      if (gaps.some(g => Math.abs(g - 0.125) > 0.003)) problems.push('steps off the grid: ' + gaps.map(g => (g * 1000).toFixed(1)).join(' ') + ' ms');
      // keyboard: k2 arrives with k1 held
      const keys = async (over, look = 0) => {
        const S = { ...structuredClone(P), ...over };
        const c = new OfflineAudioContext(2, Math.ceil(SR * 1.0), SR);
        const eng = new AudioEngine(); eng.S = S; await eng.init(c);
        if (look) eng.mod.lookahead = look;     // the live one: a misaligned handover would leave a ~40 ms gap
        eng.noteOn('k1', NOTE1);
        c.suspend(0.3).then(() => { eng.noteOn('k2', NOTE1 * 1.5); c.resume(); });
        c.suspend(0.6).then(() => { eng.noteOff('k1'); eng.noteOff('k2'); c.resume(); });
        return c.startRendering();
      };
      const kL = attacks(await keys({ monoTrig: 'legato' })).length, kR = attacks(await keys({ monoTrig: 'retrig' })).length;
      if (kL !== 1) problems.push('keyboard legato: ' + kL + ' attacks (expected 1)');
      if (kR !== 2) problems.push('keyboard retrig: ' + kR + ' attacks (expected 2)');
      const eS = env(await keys({ monoTrig: 'retrig', s: 1 }, 0.045)), w = t => eS[Math.round(t / HOP)];
      let hole = Infinity; for (let t = 0.28; t < 0.4; t += HOP) hole = Math.min(hole, w(t));
      const holeR = hole / Math.max(1e-9, w(0.25));
      if (!(holeR > 0.6)) problems.push('retrig with sustain: gap in the handover (' + holeR.toFixed(2) + ' of the level)');
      // gate (30 ms) shorter than the look-ahead (45 ms): it has to sound
      const c = new OfflineAudioContext(2, Math.ceil(SR * 0.5), SR);
      const eng = new AudioEngine(); eng.S = { ...structuredClone(P), mode: 'poly', s: 1 }; await eng.init(c);
      eng.mod.lookahead = 0.045;
      eng._directOn('x', NOTE1, 1, 0.1); eng._directOff('x', 0.13);
      const short = analyze(await c.startRendering());
      if (!(short.peak > 0.03)) problems.push('30 ms gate with 45 ms look-ahead: mute (' + dB(short.peak) + ')');
      // scheduled note-off with the envelope already in the sustain: the sustain
      // holds until the off (cancelAndHold does not anchor if no ramp crosses t;
      // without the explicit anchor the gain fell in a straight line from the end of the decay)
      const c2 = new OfflineAudioContext(2, Math.ceil(SR * 1.0), SR);
      const e2 = new AudioEngine(); e2.S = { ...structuredClone(P), mode: 'poly', s: 1 }; await e2.init(c2);
      e2._directOn('y', NOTE1, 1, 0.05); e2._directOff('y', 0.7);
      const eY = env(await c2.startRendering()), sus = eY[Math.round(0.6 / HOP)] / Math.max(1e-9, eY[Math.round(0.15 / HOP)]);
      if (!(sus > 0.9 && sus < 1.1)) problems.push('scheduled note-off: the sustain does not hold until the off (×' + sus.toFixed(2) + ' at 0.6 s)');
      console.log('trigger: attacks', log.join(' · '), '· keyboard legato/retrig', kL, kR, '· handover', holeR.toFixed(2), '· short gate', dB(short.peak), '· sustain until the off ×' + sus.toFixed(2));
      loadState(keep);
      r = { name: 'Mono trigger (legato / retrig) · arp and Seq retrigger by the gate · gate < look-ahead sounds', peak: short.peak, ok: !problems.length, problems };
    } catch (e2) {
      r = { name: 'Mono trigger (legato / retrig) · arp and Seq retrigger by the gate · gate < look-ahead sounds', peak: 0, ok: false,
            problems: ['exception: ' + ((e2 && e2.message) || e2)] };
    }
    push(r);
  }

  {
    // Sequencer articulations (Roadmap 7.0 · 5.1), offline (the Seq is advanced by
    // hand every 25 ms, as in «Mono trigger»): 4 eighth-note steps at 120 BPM (250 ms),
    // gate 0.5, sustain 1. (1) '0 0 0 0' = 4 attacks; '0~ 0 0~ 0' = 2 (the tie
    // continues the note); '0x3 . . .' = 3 (repeats). (2) Accent: in '0! 0 0 0' the
    // accented step sounds louder than the others, and only its note carries the
    // «Accent» source. (3) Slide: '0/ 12 . .' is ONE attack and the pitch slides from the note to its
    // octave (Glide 0 → 60 ms); the same in Mono. (4) The parser: combined suffixes and the
    // canonical token gives back the same.
    body.appendChild(el('st-cat', 'Sequencer articulations'));
    const NAME = 'Seq articulations (tie = one attack · repeats · louder accent and «Accent» source · slide glides, in Poly and Mono)';
    let r;
    try {
      const problems = [], log = [];
      const base = { mode: 'poly', waveA: 'sawtooth', levelA: 1, levelB: 0, cutoff: 20000, reso: 0.7, a: 0.002, d: 0.05, s: 1, r: 0.02,
        width: 0, bpm: 120, glide: 0, seqOn: 'on', seqDiv: '1/8', seqGate: 0.5 };
      const accs = [];
      const run = async over => {
        loadState({ ...base, ...over });
        const S = structuredClone(engine.S), c = new OfflineAudioContext(2, Math.ceil(SR * 1.2), SR);
        const eng = new AudioEngine(); eng.S = S; await eng.init(c);
        const on = eng._directOn.bind(eng); eng._directOn = (id, f, v, w, acc = 0) => { accs.push([w, v, acc]); return on(id, f, v, w, acc); };
        const q = eng.seq; q.held = [{ id: 'k', freq: NOTE1, vel: 1 }]; q._begin(0.03); q.timer = 'sim';
        for (let i = 1; i * 0.025 < 0.86; i++) c.suspend(i * 0.025).then(() => { q._tick(); c.resume(); });   // schedules the steps from 0.03 to 0.78 s (look-ahead 0.12)
        c.suspend(1.03).then(() => { q.held = []; q._maybeStop(); c.resume(); });
        return c.startRendering();
      };
      const HOP = Math.round(0.004 * SR);
      const env = b => { const d = b.getChannelData(0), e = []; for (let i = 0; i + HOP <= d.length; i += HOP) { let s = 0; for (let k = i; k < i + HOP; k++) s += d[k] * d[k]; e.push(Math.sqrt(s / HOP)); } return e; };
      const attacks = b => { const e = env(b), top = Math.max(...e), t = []; let up = false;
        e.forEach((v, i) => { if (!up && v > top * 0.1) { up = true; t.push({ t: i * HOP / SR, i }); } else if (up && v < top * 0.04) up = false; }); return { t, e }; };
      const hz = (b, t0, t1) => { const d = b.getChannelData(0), i0 = Math.floor(t0 * SR), i1 = Math.floor(t1 * SR); let n = 0;
        for (let i = i0 + 1; i < i1; i++) if ((d[i - 1] < 0) !== (d[i] < 0)) n++; return n / 2 / (t1 - t0); };
      // (1) tie and repeats
      for (const [pat, want] of [['0 0 0 0', 4], ['0~ 0 0~ 0', 2], ['0x3 . . .', 3]]) {
        const n = attacks(await run({ seqPat: pat })).t.length;
        log.push(pat + ' → ' + n);
        if (n !== want) problems.push('«' + pat + '»: ' + n + ' attacks (expected ' + want + ')');
      }
      // (2) accent: level of each attack (maximum of its first step) and the source on the note
      accs.length = 0;
      const a = attacks(await run({ seqPat: '0! 0 0 0' }));
      const peakAt = k => { const i0 = a.t[k].i; return Math.max(...a.e.slice(i0, i0 + Math.round(0.1 * SR / HOP))); };
      if (a.t.length !== 4) problems.push('«0! 0 0 0»: ' + a.t.length + ' attacks');
      else {
        const dB1 = 20 * Math.log10(peakAt(0) / peakAt(1));
        log.push('accent +' + dB1.toFixed(1) + ' dB');
        if (!(dB1 > 2)) problems.push('the accent does not sound louder (+' + dB1.toFixed(1) + ' dB)');
      }
      const marked = accs.filter(x => x[2] === 1).length;
      if (!(accs.length >= 4 && marked >= 1 && accs.filter(x => x[2] === 1).every(x => x[1] === 1) && accs.filter(x => x[2] === 0).every(x => x[1] < 1)))
        problems.push('«Accent» source / per-note velocity: ' + JSON.stringify(accs.slice(0, 4).map(x => [+x[1].toFixed(2), x[2]])));
      // (3) slide: one attack and the pitch slides to the octave (Poly and Mono)
      for (const mode of ['poly', 'mono']) {
        const b = await run({ seqPat: '0/ 12 . .', mode }), at = attacks(b).t.length;
        const f1 = hz(b, 0.08, 0.26), f2 = hz(b, 0.35, 0.40);   // the slide ends at 0.34 s; with gate 0.5 the note is released at 0.405
        log.push(mode + ' slide ' + f1.toFixed(0) + ' → ' + f2.toFixed(0) + ' Hz, ' + at + ' attack(s)');
        if (at !== 1) problems.push(mode + ' slide: ' + at + ' attacks (expected 1)');
        if (!(Math.abs(f1 - NOTE1) < 3 && Math.abs(f2 - 2 * NOTE1) < 5)) problems.push(mode + ' slide: ' + f1.toFixed(1) + ' → ' + f2.toFixed(1) + ' Hz (expected ' + NOTE1.toFixed(1) + ' → ' + (2 * NOTE1).toFixed(1) + ')');
      }
      // (3b) the root bug, with the keyboard: Mono legato with Glide 0.1 s — the pitch does not
      // move before the second key (the ramp used to start at the note's onset)
      {
        loadState({ ...base, seqOn: 'off', mode: 'mono', monoTrig: 'legato', glide: 0.1 });
        const c = new OfflineAudioContext(2, Math.ceil(SR * 0.8), SR);
        const eng = new AudioEngine(); eng.S = structuredClone(engine.S); await eng.init(c);
        eng.noteOn('k1', NOTE1);
        c.suspend(0.3).then(() => { eng.noteOn('k2', 2 * NOTE1); c.resume(); });
        const b = await c.startRendering(), g1 = hz(b, 0.05, 0.28), g2 = hz(b, 0.5, 0.7);
        log.push('legato ' + g1.toFixed(0) + ' → ' + g2.toFixed(0) + ' Hz');
        if (!(Math.abs(g1 - NOTE1) < 3 && Math.abs(g2 - 2 * NOTE1) < 5)) problems.push('legato with Glide: ' + g1.toFixed(1) + ' → ' + g2.toFixed(1) + ' Hz (the glide starts before the key)');
      }
      // (4) parser and canonical token
      const p = parsePattern('7!/x2 3~ 0x3 . 5/!');
      const ok4 = p[0].accent && p[0].slide && p[0].rep === 2 && p[1].tie && p[2].rep === 3 && p[3] === null && p[4].slide && p[4].accent
        && p.map(stepToken).join(' ') === '7!/x2 3~ 0x3 . 5!/';
      if (!ok4) problems.push('parser: ' + p.map(stepToken).join(' '));
      loadState({});
      console.log('articulations: ' + log.join(' · '));
      r = { name: NAME, peak: 0, ok: !problems.length, problems };
    } catch (e2) { r = { name: NAME, peak: 0, ok: false, problems: ['exception: ' + ((e2 && e2.message) || e2)] }; }
    push(r);
  }

  {
    // Swing and breathing pulse (Roadmap 7.0 · 5.4). (1) The clock: with swing 2/3 on
    // sixteenths the steps land at 0, 1/3, 1/2, 5/6 of a beat (the second of each pair,
    // late), last 1/3 and 1/6, stepAt finds them and nextGrid does not skip the delayed
    // odd one; quarters and triplets do not swing; at 0.5, straight. (2) The sequencer,
    // through the real path (offline, advanced by hand): 4 sixteenths at 120 BPM with swing
    // 2/3 attack at 0 / 167 / 250 / 417 ms (± 5). (3) The breathing pulse: k = 2,
    // Breathe 4, Cycle 4 → hits 2, 4, 6, 4 in bars 0-3; and Breathe 0, always k.
    body.appendChild(el('st-cat', 'Swing and breathing pulse'));
    const NAME = 'swing and breathing pulse (the clock swings eighths and sixteenths, not quarters or triplets · the Seq at 0/167/250/417 ms · hits 2-4-6-4)';
    let r;
    try {
      const problems = [], near = (a, b, e = 1e-9) => Math.abs(a - b) < e;
      // (1) the clock
      const ck = new Clock({ currentTime: 0 }); ck.bpm = 60; ck.origin = 0; ck.swing = 2 / 3;   // 1 beat = 1 s
      const ts = [0, 1, 2, 3].map(k => ck.swungTime(k * 0.25, 0.25)), ls = [0, 1].map(k => ck.swingLen(k * 0.25, 0.25));
      if (!(near(ts[0], 0) && near(ts[1], 1 / 3) && near(ts[2], 0.5) && near(ts[3], 5 / 6))) problems.push('sixteenths at ' + ts.map(t => t.toFixed(3)).join(' '));
      if (!(near(ls[0], 1 / 3) && near(ls[1], 1 / 6))) problems.push('durations ' + ls.map(t => t.toFixed(3)).join(' '));
      if (ck.stepAt(0.32, 0.25) !== 0 || ck.stepAt(0.34, 0.25) !== 1 || ck.stepAt(0.84, 0.25) !== 3) problems.push('stepAt with swing');
      if (!near(ck.nextGrid(0.26, 0.25), 1 / 3)) problems.push('nextGrid skips the delayed odd step (' + ck.nextGrid(0.26, 0.25).toFixed(3) + ')');
      if (!near(ck.swungTime(1, 1), 1) || !near(ck.swungTime(1 / 3, 1 / 3), 1 / 3)) problems.push('quarters or triplets swung');
      ck.swing = 0.5;
      if (!near(ck.swungTime(0.25, 0.25), 0.25)) problems.push('at 50 % it is not straight');
      // (2) the swung sequencer
      loadState({ mode: 'poly', waveA: 'sawtooth', levelA: 1, levelB: 0, cutoff: 20000, reso: 0.7, a: 0.002, d: 0.05, s: 1, r: 0.01,
        bpm: 120, swing: 2 / 3, seqOn: 'on', seqDiv: '1/16', seqGate: 0.4, seqPat: '0 0 0 0' });
      const S = structuredClone(engine.S), c = new OfflineAudioContext(2, Math.ceil(SR * 0.8), SR);
      const eng = new AudioEngine(); eng.S = S; await eng.init(c);
      const q = eng.seq; q.held = [{ id: 'k', freq: NOTE1, vel: 1 }]; q._begin(0.03); q.timer = 'sim';
      for (let i = 1; i * 0.025 < 0.36; i++) c.suspend(i * 0.025).then(() => { q._tick(); c.resume(); });   // schedules the steps from 0.03 to 0.45 s
      c.suspend(0.6).then(() => { q.held = []; q._maybeStop(); c.resume(); });
      const b = await c.startRendering(), d = b.getChannelData(0), HOP = Math.round(0.001 * SR);
      const e = []; for (let i = 0; i + HOP <= d.length; i += HOP) { let s = 0; for (let k = i; k < i + HOP; k++) s += d[k] * d[k]; e.push(Math.sqrt(s / HOP)); }
      const top = Math.max(...e), at = []; let up = false;
      e.forEach((v, i) => { if (!up && v > top * 0.2) { up = true; at.push(i * HOP / SR); } else if (up && v < top * 0.05) up = false; });
      const rel = at.map(t => (t - at[0]) * 1000), expected = [0, 166.7, 250, 416.7];
      if (at.length !== 4 || rel.some((t, i) => Math.abs(t - expected[i]) > 5)) problems.push('Seq with swing: attacks at ' + rel.map(t => t.toFixed(0)).join(' / ') + ' ms (expected 0 / 167 / 250 / 417)');
      // (3) the breathing pulse
      const pl = Object.create(Player.prototype);
      pl.cfg = { ...PLAYER_DEF, k: 2, n: 16, breathe: 4, breatheCycle: 4 };
      const ks = [0, 1, 2, 3].map(bar => pl.kAt(bar));
      if (ks.join() !== '2,4,6,4') problems.push('breathing pulse: hits ' + ks.join(' '));
      pl.cfg.breathe = 0;
      if ([0, 1, 2, 3].some(bar => pl.kAt(bar) !== 2)) problems.push('with Breathe 0 the pulse changes');
      loadState({});
      console.log('swing: Seq at ' + rel.map(t => t.toFixed(0)).join(' / ') + ' ms · breathing pulse ' + ks.join('-'));
      r = { name: NAME, peak: 0, ok: !problems.length, problems };
    } catch (e2) { r = { name: NAME, peak: 0, ok: false, problems: ['exception: ' + ((e2 && e2.message) || e2)] }; }
    push(r);
  }

  {
    // Notes by degree (Roadmap 7.0 · 5.2). (1) The mapping: major 0 2 4 5 7 9 11
    // 12 (and −1 goes down to the leading tone); minor pentatonic: degree 5 is the octave;
    // «harmony» in C major from an F: 0 2 4 6 7 (F lydian, inside the key);
    // semitones, as always. (2) Through the real path: Seq in dorian with '0 2 4 .' —
    // the third step sounds 7 semitones above the key (dorian: 0 2 3 5 7) and the second
    // 3. (3) The parts of a scene see the conductor's harmony.
    body.appendChild(el('st-cat', 'Notes by degree'));
    const NAME = 'notes by degree (major · pentatonic · scene harmony · semitones unchanged · the Seq in dorian · the parts see the harmony)';
    let r;
    try {
      const problems = [];
      const e = { S: { seqNotes: 'major' } }, q = new Seq(e), sem = ds => ds.map(d => q.semis(d, 261.63)).join(' ');
      if (sem([0, 1, 2, 3, 4, 5, 6, 7, -1]) !== '0 2 4 5 7 9 11 12 -1') problems.push('major: ' + sem([0, 1, 2, 3, 4, 5, 6, 7, -1]));
      e.S.seqNotes = 'minor penta';
      if (sem([0, 1, 4, 5]) !== '0 3 10 12') problems.push('minor pentatonic: ' + sem([0, 1, 4, 5]));
      e.S.seqNotes = 'harmony'; e.harmony = () => ({ root: 0, notes: SCALES.major });
      const fromF = [0, 1, 2, 3, 4].map(d => q.semis(d, 349.23)).join(' ');
      if (fromF !== '0 2 4 6 7') problems.push('harmony from F: ' + fromF);
      e.S.seqNotes = 'semitones';
      if (sem([0, 3, 7, -5]) !== '0 3 7 -5') problems.push('semitones: ' + sem([0, 3, 7, -5]));
      // (2) the Seq in dorian, measured
      loadState({ mode: 'poly', waveA: 'sine', levelA: 1, levelB: 0, cutoff: 20000, reso: 0.7, a: 0.002, d: 0.05, s: 1, r: 0.01,
        bpm: 120, seqOn: 'on', seqDiv: '1/8', seqGate: 0.9, seqPat: '0 2 4 .', seqNotes: 'dorian' });
      const S = structuredClone(engine.S), c = new OfflineAudioContext(2, Math.ceil(SR * 1.0), SR);
      const eng = new AudioEngine(); eng.S = S; await eng.init(c);
      const sq = eng.seq; sq.held = [{ id: 'k', freq: NOTE1, vel: 1 }]; sq._begin(0.03); sq.timer = 'sim';
      for (let i = 1; i * 0.025 < 0.66; i++) c.suspend(i * 0.025).then(() => { sq._tick(); c.resume(); });   // steps from 0.03 to 0.53 s
      c.suspend(0.8).then(() => { sq.held = []; sq._maybeStop(); c.resume(); });
      const b = await c.startRendering(), d = b.getChannelData(0);
      const hz = (t0, t1) => { let n = 0; for (let i = Math.floor(t0 * SR) + 1; i < Math.floor(t1 * SR); i++) if ((d[i - 1] < 0) !== (d[i] < 0)) n++; return n / 2 / (t1 - t0); };
      const ct = f => 1200 * Math.log2(f / NOTE1);
      const p2 = ct(hz(0.30, 0.48)), p3 = ct(hz(0.55, 0.73));   // steps 2 (0.28-0.50 s) and 3 (0.53-0.75 s)
      if (!(Math.abs(p2 - 300) < 30 && Math.abs(p3 - 700) < 30))   /* zero crossings over 0.18 s: ±12 ct resolution; one degree too many or too few is ≥ 100 away */ problems.push('Seq in dorian: steps 2 and 3 at ' + p2.toFixed(0) + ' and ' + p3.toFixed(0) + ' cents (expected 300 and 700)');
      // (3) the parts of a scene see the conductor's harmony
      const cs = new OfflineAudioContext(2, SR, SR);
      const sc = await createScene(cs, [{}, {}]);
      if (!(sc.parts.every(p => typeof p.engine.harmony === 'function' && p.engine.harmony() === sc.conductor.harmony))) problems.push('the parts do not see the scene harmony');
      loadState({});
      console.log('degrees: dorian steps 2/3 at ' + p2.toFixed(0) + ' / ' + p3.toFixed(0) + ' ct · harmony from F ' + fromF);
      r = { name: NAME, peak: 0, ok: !problems.length, problems };
    } catch (e2) { r = { name: NAME, peak: 0, ok: false, problems: ['exception: ' + ((e2 && e2.message) || e2)] }; }
    push(r);
  }

  {
    // Velocity in FM4 (fm4V, the DX7's «key velocity sensitivity»): with
    // sensitivity on the MODULATOR, hitting softly gives less index → fewer
    // harmonics (spectral tilt, which does not depend on level). Without sensitivity,
    // soft and hard have the same timbre (the VCA already scales the volume). With
    // sensitivity on the CARRIER, the level changes and not the timbre.
    body.appendChild(el('st-cat', 'Velocity in FM4'));
    let r;
    try {
      const problems = [], keep = snapshot();
      loadState({ waveA: 'fm4', levelA: 1, levelB: 0, cutoff: 20000, reso: 0.7, a: 0.002, d: 0.3, s: 0.8, r: 0.1, width: 0, fm4Alg: '0',
                  fm4R1: 1, fm4L1: 1, fm4D1: 4, fm4R2: 2, fm4L2: 0.6, fm4D2: 4, fm4L3: 0, fm4L4: 0 });
      const P = structuredClone(engine.S);
      const one = async (over, vel) => renderOne({ ...structuredClone(P), ...over }, { secs: 0.6, offAt: 0.5, vel });
      const rms = (b, t0, t1) => { const d = b.getChannelData(0); let s = 0, n = 0; for (let i = Math.floor(t0 * SR); i < Math.floor(t1 * SR); i++) { s += d[i] * d[i]; n++; } return Math.sqrt(s / n); };
      const pair = async over => { const hi = await one(over, 1), lo = await one(over, 0.3);
        return { tilt: tiltW(hi, 0.1, 0.4) / Math.max(1e-12, tiltW(lo, 0.1, 0.4)), lvl: rms(hi, 0.1, 0.4) / Math.max(1e-12, rms(lo, 0.1, 0.4)), peak: analyze(hi).peak }; };
      const mod = await pair({ fm4V2: 1 }), ctl = await pair({}), car = await pair({ fm4V1: 1 });
      if (!(mod.tilt > 2)) problems.push('modulator with vel: hard/soft barely changes the brightness (×' + mod.tilt.toFixed(2) + ')');
      if (!(ctl.tilt > 0.8 && ctl.tilt < 1.25)) problems.push('control without vel: the brightness changes with velocity (×' + ctl.tilt.toFixed(2) + ')');
      if (!(car.tilt > 0.8 && car.tilt < 1.25)) problems.push('carrier with vel: the brightness changes (×' + car.tilt.toFixed(2) + '), only the level should');
      if (!(car.lvl > ctl.lvl * 2)) problems.push('carrier with vel: the level does not scale (×' + car.lvl.toFixed(2) + ' vs ×' + ctl.lvl.toFixed(2) + ' without vel)');
      if (mod.peak > 1) problems.push('clipping');
      console.log('fm4 vel: brightness hard/soft modulator', mod.tilt.toFixed(2), 'control', ctl.tilt.toFixed(2), 'carrier', car.tilt.toFixed(2), '· carrier level', car.lvl.toFixed(2), 'control', ctl.lvl.toFixed(2));
      loadState(keep);
      r = { name: 'Velocity in FM4: on the modulator it changes the timbre, on the carrier the level', peak: mod.peak, ok: !problems.length, problems };
    } catch (e2) {
      r = { name: 'Velocity in FM4: on the modulator it changes the timbre, on the carrier the level', peak: 0, ok: false,
            problems: ['exception: ' + ((e2 && e2.message) || e2)] };
    }
    push(r);
  }

  {
    // Minimoog-style mixer (1.2.0): each source adds in with ITS level.
    // (1) Superposition: with everything linear (filter open and flat, no drive, low
    // level so that the limiter does not act) the mix at 0.3 · 0.5 · 0.2 IS
    // 0.3·A + 0.5·B + 0.2·A×B rendered separately: raising one does not lower another.
    // (2) Sums: A and B at full, +6.02 dB over A alone if they are the same wave in phase
    // (amplitudes add) and ≈ +3 dB detuned (powers add: no correlation).
    // (3) An old preset (Mix + Ring) sounds the same as its translation.
    // And a MEASUREMENT (no threshold): how hard the limiter works with a factory pad
    // chord if both oscillators are raised to full — the price of adding.
    body.appendChild(el('st-cat', 'Mixer'));
    let r;
    try {
      const problems = [], keep = snapshot();
      const lin = { waveA: 'sawtooth', waveB: 'square', detuneB: 7, cutoff: 20000, reso: -3, a: 0.005, d: 0.05, s: 1, r: 0.05, width: 0, amplitude: 0.25, master: 0.4 };
      const one = async (st, secs = 0.8) => { loadState(st); return (await renderOne(structuredClone(engine.S), { secs, offAt: secs - 0.1 })).getChannelData(0); };
      const rmsW = (d, t0, t1) => { let s = 0, n = 0; for (let i = Math.floor(t0 * SR); i < Math.floor(t1 * SR); i++) { s += d[i] * d[i]; n++; } return Math.sqrt(s / n); };
      const a = await one({ ...lin, levelA: 1, levelB: 0, ring: 0 }), b = await one({ ...lin, levelA: 0, levelB: 1, ring: 0 });
      const c = await one({ ...lin, levelA: 0, levelB: 0, ring: 1 }), m = await one({ ...lin, levelA: 0.3, levelB: 0.5, ring: 0.2 });
      let e = 0, s = 0;
      for (let i = Math.floor(0.05 * SR); i < Math.floor(0.65 * SR); i++) { const x = 0.3 * a[i] + 0.5 * b[i] + 0.2 * c[i]; e += (m[i] - x) ** 2; s += m[i] * m[i]; }
      const sup = 10 * Math.log10(e / s + 1e-30);
      if (!(sup < -80)) problems.push('the mix is not the sum of its sources (error ' + sup.toFixed(0) + ' dB)');
      const saw = { ...lin, waveB: 'sawtooth' };
      const a1 = rmsW(await one({ ...saw, detuneB: 0, levelA: 1, levelB: 0 }), 0.1, 0.6);
      const gIn = 20 * Math.log10(rmsW(await one({ ...saw, detuneB: 0, levelA: 1, levelB: 1 }), 0.1, 0.6) / a1);
      // 50 ct: the fundamental beats at ~3.9 Hz → 5 beats in the window (with 7 ct, one every 2 s: the average would not come out)
      const a1d = rmsW(await one({ ...saw, detuneB: 50, levelA: 1, levelB: 0 }, 1.6), 0.1, 1.5);
      const gDet = 20 * Math.log10(rmsW(await one({ ...saw, detuneB: 50, levelA: 1, levelB: 1 }, 1.6), 0.1, 1.5) / a1d);
      if (!(Math.abs(gIn - 6.02) < 0.1)) problems.push('A+B in phase: +' + gIn.toFixed(2) + ' dB (expected +6.02)');
      if (!(gDet > 2.5 && gDet < 3.5)) problems.push('A+B detuned: +' + gDet.toFixed(2) + ' dB (expected ≈ +3)');
      const oldPreset = { waveA: 'sine', waveB: 'sine', detuneB: 12, octavesB: 2, mix: 0.5, ring: 0.3, cutoff: 20000, amplitude: 0.25, master: 0.4 };
      const { mix, ...newPreset } = oldPreset;
      // not bit for bit: two renders of the SAME state already differ by ~1e-8 (measured: −126 dB below the peak, same as old/new)
      const v0 = await one(oldPreset), v1 = await one({ ...newPreset, levelA: 0.35, levelB: 0.35 });
      const pk = v1.reduce((mx, x) => Math.max(mx, Math.abs(x)), 0), dv = v0.reduce((mx, x, i) => Math.max(mx, Math.abs(x - v1[i])), 0);
      const gap = 20 * Math.log10(dv / pk + 1e-30);
      if (!(gap < -100)) problems.push('an old preset (Mix 0.5 · Ring 0.3) does not sound the same as its translation (Δ ' + gap.toFixed(0) + ' dB)');
      // the measurement: Warm Pad (levels 0.5/0.5 = the old centered Mix) with a four-note chord
      const CH4 = [130.81, 196.0, 261.63, 329.63], TOP = Math.pow(10, -1.3 / 20), W = Math.round(0.01 * SR);
      const hot = async st => {
        loadState(st);
        const cx = new OfflineAudioContext(2, Math.ceil(SR * 2.4), SR);
        const eng = new AudioEngine(); eng.S = structuredClone(engine.S); await eng.init(cx);
        CH4.forEach((f, i) => eng.noteOn('n' + i, f, 1));
        cx.suspend(1.8).then(() => { CH4.forEach((f, i) => eng.noteOff('n' + i)); cx.resume(); });
        const bf = await cx.startRendering(), l = bf.getChannelData(0), rr = bf.getChannelData(1);
        let n = 0, h = 0;
        for (let i = 0; i + W <= Math.floor(1.8 * SR); i += W, n++) { let p = 0; for (let k = i; k < i + W; k++) p = Math.max(p, Math.abs(l[k]), Math.abs(rr[k])); if (p > TOP) h++; }
        return (100 * h / n).toFixed(0) + ' %';
      };
      const pad = FX.warmPad;
      console.log('mixer: superposition', sup.toFixed(0), 'dB · old/translated', gap.toFixed(0), 'dB · A+B in phase +' + gIn.toFixed(2), 'dB · detuned +' + gDet.toFixed(2),
        'dB · Warm Pad, 4-note chord: limiter ' + await hot(pad) + ' (levels 0.5/0.5) → ' + await hot({ ...pad, levelA: 1, levelB: 1 }) + ' (1/1)');
      loadState(keep);
      r = { name: 'mixer: each source adds in with its level (in phase +6 dB, detuned +3 dB); old presets sound the same', peak: 0, ok: !problems.length, problems };
    } catch (e2) {
      r = { name: 'mixer: each source adds in with its level (in phase +6 dB, detuned +3 dB); old presets sound the same', peak: 0, ok: false,
            problems: ['exception: ' + ((e2 && e2.message) || e2)] };
    }
    push(r);
  }

  {
    // Master headroom (1.1.0): an open four-note chord with the factory pads
    // does not make the limiter WORK. What you hear is not a peak brushing the
    // ceiling for an instant (with random phases and drifts the peak of a chord varies
    // ±1 dB from one run to the next), but it clipping all the time: the pads used to
    // come in 4-8 dB above with THREE notes and 100 % of the 10 ms blocks
    // of the sustain were clipped, with the gain going up and down with the beating
    // (the «dirty, up-and-down» chord). Clipped block = its peak goes over −1.3 dBFS
    // (the limiter pins it at −1). And the Master, now BEFORE the limiter, at full
    // with 16 notes does not go over the ceiling.
    body.appendChild(el('st-cat', 'Master headroom'));
    let r;
    try {
      const problems = [], keep = snapshot(), CH4 = [130.81, 196.0, 261.63, 329.63];
      const peaks = [];
      for (const [n, pad] of [['Supersaw Pad', FX.supersawPad], ['Warm Pad', FX.warmPad], ['Solina Strings', FX.solinaStrings], ['Plate Pad', FX.platePad], ['Human Choir', FX.humanChoir]]) {
        loadState(pad);
        const c = new OfflineAudioContext(2, Math.ceil(SR * 2.4), SR);
        const eng = new AudioEngine(); eng.S = structuredClone(engine.S); await eng.init(c);
        CH4.forEach((f, i) => eng.noteOn('n' + i, f, 1));
        c.suspend(1.8).then(() => { CH4.forEach((f, i) => eng.noteOff('n' + i)); c.resume(); });
        const b = await c.startRendering(), a = analyze(b), l = b.getChannelData(0), rr = b.getChannelData(1), W = Math.round(0.01 * SR), TOP = Math.pow(10, -1.3 / 20);
        let hot = 0, n10 = 0;
        for (let i = 0; i + W <= Math.floor(1.8 * SR); i += W, n10++) { let p = 0; for (let k = i; k < i + W; k++) p = Math.max(p, Math.abs(l[k]), Math.abs(rr[k])); if (p > TOP) hot++; }
        const pct = 100 * hot / n10;
        peaks.push(n + ' ' + dB(a.peak) + ' (' + pct.toFixed(1) + ' %)');
        if (!(pct < 3)) problems.push(n + ': the limiter works on ' + pct.toFixed(0) + ' % of the chord (peak ' + dB(a.peak) + ')');
        if (a.peak <= SILENCE) problems.push(n + ': silent');
      }
      loadState({ master: 1 });
      const st = await renderStress(structuredClone(engine.S));   // (it already returns the analysis)
      if (st.peak <= SILENCE) problems.push('16 notes with Master at full: silence');
      if (st.peak > Math.pow(10, -0.9 / 20)) problems.push('16 notes with Master at full go over the ceiling (' + dB(st.peak) + ')');
      console.log('headroom: peaks with 4 notes', peaks.join(' · '), '· 16 notes Master 1', dB(st.peak));
      loadState(keep);
      r = { name: 'headroom: with a pad chord the limiter does not work; the Master at full does not go over the ceiling', peak: st.peak, ok: !problems.length, problems };
    } catch (e2) {
      r = { name: 'headroom: with a pad chord the limiter does not work; the Master at full does not go over the ceiling', peak: 0, ok: false, problems: ['exception: ' + ((e2 && e2.message) || e2)] };
    }
    push(r);
  }

  // (The «factory loudness» check of 1.1.0 — five presets at −14 LUFS in their use — is now the
  // whole bank, preset by preset, in the «factory» batch: measurePreset.)

  {
    // Master limiter with test signals (worklets/limiter-processor.js):
    // (1) below the ceiling it is TRANSPARENT: the output is the input delayed by the
    // lookahead and with the makeup, sample by sample; (2) a burst at +12 dB — and another
    // only on the right channel — leaves NO sample above the ceiling, with no
    // NaN, and after the silence the gain comes back (the final sine comes out like the one at the
    // start); (3) TRUE inter-sample peak (dBTP, ×4 oversampling with windowed
    // sinc): the ceiling is a sample ceiling (−1 dBFS) and leaves 1 dB for what the
    // converter reconstructs between samples; measured in the worst musical case (16
    // bright notes with the Master at +12 dB, the limiter squeezing hard).
    body.appendChild(el('st-cat', 'Limiter'));
    let r;
    try {
      const problems = [], CEIL = Math.pow(10, LIM_CEIL_DB / 20), MK = Math.pow(10, LIM_MAKEUP_DB / 20), L = Math.round(LIM_LOOKAHEAD * SR);
      const N = Math.ceil(SR * 1.6), ctx = new OfflineAudioContext(2, N, SR);
      await loadWorklets(ctx);
      const room = new Room(ctx, makeDefaultState(), { master: 1 });
      const buf = ctx.createBuffer(2, N, SR), xl = buf.getChannelData(0), xr = buf.getChannelData(1);
      const lo = Math.pow(10, -12 / 20), seg = (t0, t1, f) => { for (let i = Math.floor(t0 * SR); i < Math.floor(t1 * SR); i++) f(i, i / SR); };
      seg(0.0, 0.3, (i, t) => { xl[i] = xr[i] = lo * Math.sin(2 * Math.PI * 440 * t); });                        // (1) sine at −12 dBFS
      seg(0.4, 0.6, (i, t) => { const v = 4 * ((t * 220) % 1 * 2 - 1); xl[i] = v; xr[i] = -v; });                // (2) saw at +12 dB
      seg(0.7, 0.8, (i, t) => { xr[i] = 4 * Math.sin(2 * Math.PI * 3000 * t); });                                // (2) R only
      seg(1.3, 1.6, (i, t) => { xl[i] = xr[i] = lo * Math.sin(2 * Math.PI * 440 * t); });                        // (2) sine after the silence
      const src = ctx.createBufferSource(); src.buffer = buf; src.connect(room.comp); src.start(0);
      const out = await ctx.startRendering(), yl = out.getChannelData(0), yr = out.getChannelData(1);
      let dT = 0; for (let i = L + 100; i < Math.floor(0.3 * SR); i++) dT = Math.max(dT, Math.abs(yl[i] - xl[i - L] * MK), Math.abs(yr[i] - xr[i - L] * MK));
      if (!(dT < 1e-5)) problems.push('below the ceiling it is not transparent (max |Δ| ' + dT.toExponential(2) + ')');
      let pk = 0, bad = 0; for (let i = 0; i < N; i++) { if (!Number.isFinite(yl[i]) || !Number.isFinite(yr[i])) bad++; else pk = Math.max(pk, Math.abs(yl[i]), Math.abs(yr[i])); }
      if (bad) problems.push(bad + ' NaN/Inf samples');
      if (pk > CEIL * 1.0001) problems.push('a sample goes over the ceiling (' + dB(pk) + ')');
      let dR = 0; for (let i = Math.floor(1.45 * SR); i < Math.floor(1.55 * SR); i++) dR = Math.max(dR, Math.abs(yl[i] - xl[i - L] * MK));
      if (!(dR < 1e-3)) problems.push('after the silence the gain does not come back (|Δ| ' + dR.toExponential(2) + ')');
      // true peak: ×4 interpolation with windowed sinc (Hann, 16 samples on each side)
      const truePeak = (a, b) => { let p = 0; const H = 16, ph = [0.25, 0.5, 0.75].map(f => { const w = []; for (let k = -H + 1; k <= H; k++) { const x = k - f; w.push(Math.sin(Math.PI * x) / (Math.PI * x) * (0.5 + 0.5 * Math.cos(Math.PI * x / H))); } return w; });
        for (const d of [a, b]) for (let i = H; i < d.length - H; i++) { p = Math.max(p, Math.abs(d[i])); for (const w of ph) { let s = 0; for (let k = 0; k < w.length; k++) s += w[k] * d[i - H + 1 + k]; p = Math.max(p, Math.abs(s)); } }
        return p; };
      const keep = snapshot();
      loadState({ waveA: 'supersaw', waveB: 'square', levelA: 0.5, levelB: 0.5, cutoff: 20000, reso: 0.7, master: 4 });
      const c2 = new OfflineAudioContext(2, Math.ceil(SR * 1.0), SR);
      const e2 = new AudioEngine(); e2.S = structuredClone(engine.S); await e2.init(c2);
      for (let i = 0; i < 16; i++) e2.noteOn('s' + i, 220 * Math.pow(2, i / 12));
      const m2 = await c2.startRendering(), tp = truePeak(m2.getChannelData(0), m2.getChannelData(1)), sp = analyze(m2).peak;
      if (!(tp < 1)) problems.push('true peak above 0 dBTP (' + dB(tp) + '; sample peak ' + dB(sp) + ')');
      loadState(keep);
      console.log('limiter: transparent |Δ| ' + dT.toExponential(1) + ' · sample peak with +12 dB ' + dB(pk) + ' · recovery |Δ| ' + dR.toExponential(1) + ' · worst musical case: sample ' + dB(sp) + ', true ' + dB(tp));
      r = { name: 'limiter: transparent under the ceiling, no sample goes over it, it recovers; true peak < 0 dBTP', peak: pk, ok: !problems.length, problems };
    } catch (e2) {
      r = { name: 'limiter: transparent under the ceiling, no sample goes over it, it recovers; true peak < 0 dBTP', peak: 0, ok: false, problems: ['exception: ' + ((e2 && e2.message) || e2)] };
    }
    push(r);
  }

  {
    // No DC (polish, 2026-10-25): each part comes out AC-coupled (AudioEngine,
    // AC_HZ). A narrow pulse has a mean ≠ 0 — in the factory audit, 19 presets
    // above 5 % of their level and «Square Lead» at 57 % —; at the output, below
    // 2 %. One note from each, the mean against the RMS between 0.55 and 1 s.
    body.appendChild(el('st-cat', 'No DC'));
    const NAME = 'no DC (narrow pulses come out centered: < 2 % of the level)';
    let r;
    try {
      const problems = [], measures = [];
      const find = n => { for (const ps of Object.values(FACTORY)) if (ps[n]) return ps[n]; };
      for (const n of ['Square Lead', 'Rave Hoover', 'PWM Ensemble']) {
        const S = applyPreset(makeDefaultState(), find(n));
        const ctx = new OfflineAudioContext(2, Math.ceil(SR * 1.2), SR);
        const eng = new AudioEngine(); eng.S = S; await eng.init(ctx);
        eng.noteOn('d', 130.81, 1);
        const d = (await ctx.startRendering()).getChannelData(0);
        let sum = 0, sq = 0, k = 0; for (let i = Math.floor(0.55 * SR); i < Math.floor(1.0 * SR); i++) { sum += d[i]; sq += d[i] * d[i]; k++; }
        const dc = Math.abs(sum / k) / Math.max(1e-9, Math.sqrt(sq / k));
        measures.push(n + ' ' + (dc * 100).toFixed(2) + ' %');
        if (!(dc < 0.02)) problems.push(n + ': DC at ' + (dc * 100).toFixed(1) + ' % of the level');
      }
      console.log('no dc: ' + measures.join(' · '));
      r = { name: NAME, peak: 0, ok: !problems.length, problems };
    } catch (e2) { r = { name: NAME, peak: 0, ok: false, problems: ['exception: ' + ((e2 && e2.message) || e2)] }; }
    push(r);
  }

  {
    // No clicks when moving knobs (polish, 2026-10-25). The audit changed at once, with a
    // note sounding, the 135 numeric parameters of a state with almost everything on: only
    // the delay Time gave a scrape (the head traveled 3.7 s of tape in 20 ms; now the
    // echo time changes like on a tape, DLY_SLEW). Here, ten representative ones: the jump
    // at the sample of the change cannot be sharper than the note before NOR than the one
    // after (×3, and above −40 dB below the peak).
    body.appendChild(el('st-cat', 'No clicks when moving knobs'));
    const NAME = 'no clicks when moving knobs suddenly (delay Time, cutoff, reso, drive, distortion, feedback, morph, master…)';
    let r;
    try {
      const problems = [], measures = [];
      const RICH = { waveA: 'sawtooth', waveB: 'square', levelA: 0.5, levelB: 0.4, noise: 0.05, cutoff: 1500, reso: 4, filterEnvAmt: 800,
        filterDrive: 0.3, a: 0.01, d: 0.3, s: 0.8, r: 0.3, dlyAmt: 0.3, dlyFb: 0.5, reverbMix: 0.25, chAmt: 0.4, flAmt: 0.3, dist: 0.2,
        width: 0.4, cutLfoLvl: 300, freqLfoLvl: 5, master: 1 };
      const cases = [['dlyTime', 4], ['dlyTime', 0.02], ['cutoff', 20000], ['reso', 24], ['filterDrive', 1], ['dist', 1], ['dlyFb', 1.1], ['wtPos', 1], ['master', 4], ['levelB', 1]];
      for (const [k, to] of cases) {
        const S = applyPreset(makeDefaultState(), RICH), ctx = new OfflineAudioContext(2, Math.ceil(SR * 0.9), SR);
        const eng = new AudioEngine(); eng.S = S; await eng.init(ctx);
        eng.noteOn('n', 130.81, 1);
        ctx.suspend(0.5).then(() => { eng.set(k, to); ctx.resume(); });
        const d = (await ctx.startRendering()).getChannelData(0), N = d.length;
        const d2 = i => Math.abs(d[i] - 2 * d[i - 1] + d[i - 2]);
        const mx = (t0, t1) => { let m = 0; for (let i = Math.floor(t0 * SR); i < Math.min(N, Math.floor(t1 * SR)); i++) m = Math.max(m, d2(i)); return m; };
        let pk = 0; for (const x of d) pk = Math.max(pk, Math.abs(x));
        const jump = mx(0.495, 0.53), ratio = jump / Math.max(1e-9, mx(0.3, 0.495), mx(0.6, 0.85));
        measures.push(k + '→' + to + ' ×' + ratio.toFixed(1));
        if (ratio > 3 && jump / Math.max(1e-9, pk) > 0.01) problems.push(k + ' → ' + to + ': jump ×' + ratio.toFixed(1));
      }
      console.log('sudden knobs: ' + measures.join(' · '));
      r = { name: NAME, peak: 0, ok: !problems.length, problems };
    } catch (e2) { r = { name: NAME, peak: 0, ok: false, problems: ['exception: ' + ((e2 && e2.message) || e2)] }; }
    push(r);
  }

  {
    // Output meter (Roadmap 7.0 · 1.3). Engine: with 'meter-on', the limiter sends
    // the interval maxima every 50 ms; a burst at +12 dB on L shows > 6 dB of
    // reduction and its input peak, no output peak goes over the ceiling and in the
    // silence afterwards the peaks are 0. UI (ui/meter.js, fed with that data
    // as is): the burst fills the reduction bar and lights the LED, which stays
    // lit; after 3 s of silence, peaks «−∞» and empty bars (they fall at 24 dB/s);
    // the click turns the LED off.
    const NAME = 'output meter (peaks and limiter reduction · LED that stays lit · −∞ in silence)';
    let r;
    try {
      const problems = [], CEIL = Math.pow(10, LIM_CEIL_DB / 20), N = Math.ceil(SR * 1.2), ctx = new OfflineAudioContext(2, N, SR);
      await loadWorklets(ctx);
      const room = new Room(ctx, makeDefaultState(), { master: 1 });
      const msgs = []; room.comp.port.onmessage = e => msgs.push(e.data);
      room.comp.port.postMessage('meter-on');
      await new Promise(res => setTimeout(res, 50));
      const buf = ctx.createBuffer(2, N, SR), xl = buf.getChannelData(0), xr = buf.getChannelData(1);
      for (let i = Math.floor(0.1 * SR); i < Math.floor(0.4 * SR); i++) { const s = Math.sin(2 * Math.PI * 440 * i / SR); xl[i] = 4 * s; xr[i] = 0.25 * s; }   // L at +12 dB, R at −12
      const src = ctx.createBufferSource(); src.buffer = buf; src.connect(room.comp); src.start(0);
      await ctx.startRendering();
      await new Promise(res => setTimeout(res, 100));
      const grDb = m => -20 * Math.log10(m.g);
      const maxGr = Math.max(0, ...msgs.map(grDb)), maxIn = Math.max(0, ...msgs.map(m => m.i)), maxOut = Math.max(0, ...msgs.map(m => Math.max(m.l, m.r)));
      const last = msgs[msgs.length - 1];
      if (!(msgs.length >= 18 && msgs.length <= 26)) problems.push(msgs.length + ' messages in 1.2 s (expected ~24)');
      if (!(maxGr > 6)) problems.push('the burst shows ' + maxGr.toFixed(1) + ' dB of reduction (expected > 6)');
      if (!(20 * Math.log10(maxIn) > 12)) problems.push('input peak ' + (20 * Math.log10(maxIn)).toFixed(1) + ' dB (expected > +12)');
      if (!(maxOut <= CEIL * 1.0001)) problems.push('an output peak goes over the ceiling (' + (20 * Math.log10(maxOut)).toFixed(2) + ' dBFS)');
      if (!last || last.l !== 0 || last.r !== 0) problems.push('in silence the peaks are not 0 (' + (last ? last.l + '/' + last.r : 'no data') + ')');
      // the UI, with that data and then 3 s of silence (all in a row: without the live engine's data getting in)
      const led = document.getElementById('mtLed'), grBar = document.querySelector('#meter .mt-gr i');
      const scale = e => +(/scaleY\(([\d.]+)\)/.exec(e.style.transform) || [0, NaN])[1];
      led.classList.remove('on');
      const t0 = performance.now() / 1000 + 10;
      let grFull = 0;
      msgs.forEach((m, k) => { feedMeter(m, t0 + k * 0.05); grFull = Math.max(grFull, scale(grBar)); });
      if (!(grFull > 0.5)) problems.push('the reduction bar reaches ' + grFull.toFixed(2) + ' (expected > 0.5: more than 6 of 12 dB)');
      if (!meterLedOn()) problems.push('the burst does not light the LED');
      for (let k = 0; k < 60; k++) feedMeter({ l: 0, r: 0, i: 0, g: 1 }, t0 + (msgs.length + k) * 0.05);
      const covers = [...document.querySelectorAll('#meter .mt-ch i')].map(scale);
      if (document.getElementById('mtPk').textContent !== '−∞') problems.push('in silence the peak says «' + document.getElementById('mtPk').textContent + '»');
      if (!covers.every(c => c === 1) || scale(grBar) !== 0) problems.push('in silence the bars do not empty (' + covers.join('/') + ' · ' + scale(grBar) + ')');
      if (!meterLedOn()) problems.push('the LED does not stay lit');
      led.click();
      if (meterLedOn()) problems.push('the click does not turn the LED off');
      console.log('meter: ' + msgs.length + ' messages · max reduction ' + maxGr.toFixed(1) + ' dB · input ' + (20 * Math.log10(maxIn)).toFixed(1) + ' dB · output ' + (20 * Math.log10(maxOut)).toFixed(2) + ' dBFS');
      r = { name: NAME, peak: 0, ok: !problems.length, problems };
    } catch (e2) { r = { name: NAME, peak: 0, ok: false, problems: ['exception: ' + ((e2 && e2.message) || e2)] }; }
    push(r);
  }

  // Neutral Reset (Oct 2026): {} leaves oscillator A on its own and no module
  // touches the signal (every `act` param at 0, filter open and flat, gate); a
  // NON-empty preset goes over PRESET_BASE (the old defaults) and sounds as always
  {
    body.appendChild(el('st-cat', 'Neutral Reset'));
    const problems = [];
    loadState({});
    const z = snapshot();
    for (const k in PARAMS) if (PARAMS[k].act && k !== 'levelA' && z[k] !== 0) problems.push('Reset: ' + k + ' = ' + z[k]);   // level A at 1: A on its own
    if (!(z.levelA === 1 && z.levelB === 0 && z.detuneB === 0 && z.cutoff === PARAMS.cutoff.max && z.reso === -3 && z.s === 1))
      problems.push('Reset not neutral: levels ' + z.levelA + '/' + z.levelB + ' · detuneB ' + z.detuneB + ' · cutoff ' + z.cutoff + ' · reso ' + z.reso + ' · s ' + z.s);
    let n = 0;
    for (const cat in FACTORY) for (const name in FACTORY[cat]) {
      const p = FACTORY[cat][name]; if (!Object.keys(p).length) continue;
      loadState(p); const q = snapshot(); n++;
      const k = Object.keys(PRESET_BASE).find(k => !(k in p) && q[k] !== PRESET_BASE[k]);
      if (k) problems.push(name + ': ' + k + ' = ' + q[k] + ' (base ' + PRESET_BASE[k] + ')');
    }
    if (toControls(applyPreset(makeDefaultState(), { master: 0.5 })).cutoff !== PRESET_BASE.cutoff) problems.push('applyPreset (Parts) does not go over the preset base');
    loadState({});
    push({ name: 'Neutral Reset · ' + n + ' factory presets over the usual base', peak: 0, ok: !problems.length, problems: problems.slice(0, 4) });
  }

  // Version: X.Y.Z, the first CHANGELOG entry is this one (no version is released
  // without a note) and the header shows it
  {
    body.appendChild(el('st-cat', 'Release'));
    const problems = [];
    let top = null;
    try {
      const md = await (await fetch('CHANGELOG.md', { cache: 'no-store' })).text();
      const m = /^## \[(\d+\.\d+\.\d+)\](?: — (\d{4}-\d{2}-\d{2}))?/m.exec(md) || [];
      top = m[1] || null;
      if (m[2] !== RELEASE) problems.push('the CHANGELOG date (' + m[2] + ') is not RELEASE (' + RELEASE + ')');
    } catch (e) { problems.push('could not read CHANGELOG.md'); }
    if (!/^\d+\.\d+\.\d+$/.test(VERSION)) problems.push('VERSION is not X.Y.Z: ' + VERSION);
    if (top !== VERSION) problems.push('the CHANGELOG starts with ' + top + ' and VERSION is ' + VERSION);
    const badge = document.getElementById('verBadge');
    if (!badge || badge.textContent !== 'v' + VERSION) problems.push('the header does not show v' + VERSION);
    push({ name: 'version ' + VERSION + ' of ' + RELEASE + ' (= first CHANGELOG entry, visible in the header)', peak: 0, ok: !problems.length, problems });
  }
  {
    // Welcome window: one frame of the effect paints something (not a flat color),
    // the name has fully come in by 3 s and the date it shows is RELEASE's.
    const problems = [];
    const cv = document.createElement('canvas'), fx = new SplashFx(cv);
    fx.frame(3.0);
    const d = fx.px, seen = new Set(); for (let i = 0; i < d.length; i += 7) seen.add(d[i]);
    if (!(seen.size > 40)) problems.push('the frame has ' + seen.size + ' colors (flat?)');
    const full = fx.tmask.reduce((a, v) => a + v, 0);
    if (!(full > 300 && fx.stats.title === full)) problems.push('the name: ' + fx.stats.title + ' of ' + full + ' pixels');
    const want = new Date(RELEASE + 'T12:00:00').getFullYear() + '';
    if (!splashDate(RELEASE).includes(want)) problems.push('date: «' + splashDate(RELEASE) + '»');
    // «About»: the header title reopens it (here, with ?selftest, it started closed),
    // with BACK; while it is open, a key does not play; Escape closes it
    const sp = document.getElementById('splash');
    if (!sp || !sp.hidden) problems.push('with ?selftest the window should start closed');
    else {
      document.getElementById('aboutBtn').click();
      const lab = document.querySelector('#spEnter span').textContent;
      if (sp.hidden || lab !== 'BACK') problems.push('«About»: ' + (sp.hidden ? 'it does not open' : 'the button says ' + lab));
      const before = engine.voices.size;
      document.body.dispatchEvent(new KeyboardEvent('keydown', { key: 'z', code: 'KeyZ', bubbles: true }));
      const during = engine.voices.size;
      document.body.dispatchEvent(new KeyboardEvent('keyup', { key: 'z', code: 'KeyZ', bubbles: true }));
      document.body.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', code: 'Escape', bubbles: true }));
      await new Promise(res => setTimeout(res, 600));
      if (during !== before) problems.push('with the window open the keyboard plays');
      if (!sp.hidden) problems.push('Escape does not close the «About»');
    }
    push({ name: 'welcome window (the frame paints · the whole name · version and date · «About»)', peak: 0, ok: !problems.length, problems });
  }

  // Social card (Open Graph): title, description, URL and image present; the
  // image with an ABSOLUTE URL under og:url (social networks do not resolve relative paths), its
  // file exists in the repo and measures what og:image:width/height declare
  {
    const problems = [];
    const og = p => document.querySelector(`meta[property="og:${p}"]`)?.content || '';
    for (const p of ['title', 'description', 'url', 'image']) if (!og(p)) problems.push('missing og:' + p);
    const url = og('url'), img = og('image');
    let w = 0, h = 0;
    if (!(url.startsWith('https://') && img.startsWith(url))) problems.push('og:image is not absolute under og:url (' + img + ')');
    else {
      const im = new Image(); im.src = img.slice(url.length);   // the SAME file, served from here
      try { await im.decode(); w = im.naturalWidth; h = im.naturalHeight; } catch (e) { problems.push('not found: ' + img.slice(url.length)); }
    }
    if (w && !(w === +og('image:width') && h === +og('image:height')))
      problems.push('the image measures ' + w + '×' + h + ' and og:image:width/height say ' + og('image:width') + '×' + og('image:height'));
    push({ name: 'social card (Open Graph, image ' + (w ? w + '×' + h : '—') + ')', peak: 0, ok: !problems.length, problems });
  }

  }   // ---------- end of the «checks» batch ----------

  if (inBatch('factory')) {   // ---------- «factory» batch: the bank measured in its use, the stress test and the pair probe ----------
  // the {} state is equivalent to the Reset button
  body.appendChild(el('st-cat', 'Base'));
  push(await testPreset('Reset ({})', {}));
  // The bank (docs/BANK.md): each preset rendered in its USE — one note, a major triad or one
  // hit, sequencer and arpeggiator off — and judged on NaN, silence, the limiter working (% of
  // 10 ms blocks over −1.3 dBFS), loudness against −14 LUFS (hits: the peak against −4 dBFS), DC
  // and the dry tail after the release. The ping carries the Master that would land it on the
  // target: that is how the bank is tuned (node tools/run-selftest.mjs "selftest=1&batch=factory").
  // Then the spectral fingerprints of all of them: the closest pairs are logged — no two alike.
  const prints = [];
  for (const c of BANK) {
    body.appendChild(el('st-cat', c.cat));
    for (const p of c.presets) {
      const { row, info } = await measurePreset(c.cat, p);
      push(row);
      summary.textContent = ok + '/' + results.length;
      if (info && info.print) prints.push([p.name, info.print]);
      ping('bank=' + encodeURIComponent(p.name) + '&ok=' + (row.ok ? 1 : 0) +
           (info ? '&use=' + info.use + '&lufs=' + info.lufs + '&peak=' + info.peak + '&clip=' + info.clip + '&dc=' + (info.dc ?? '') + '&tail=' + (info.tail ?? '') + '&master=' + info.master + '&sugg=' + info.sugg : '') +
           (row.ok ? '' : '&why=' + encodeURIComponent(row.problems.join(' | '))));
    }
  }
  {
    const pairs = [];
    for (let i = 0; i < prints.length; i++) for (let j = i + 1; j < prints.length; j++) pairs.push([fpDistance(prints[i][1], prints[j][1]), prints[i][0], prints[j][0]]);
    pairs.sort((a, b) => a[0] - b[0]);
    for (const [d, A, B] of pairs.slice(0, 12)) ping('sim=' + encodeURIComponent(A + ' || ' + B) + '&dist=' + d.toFixed(2));
    const close = pairs.filter(p => p[0] < SIM_MIN_DB).map(p => p[1] + ' ≈ ' + p[2] + ' (' + p[0].toFixed(1) + ' dB)');
    console.log('similarity: closest ' + pairs.slice(0, 5).map(([d, A, B]) => A + ' ≈ ' + B + ' ' + d.toFixed(1)).join(' · ') + ' · median ' + (pairs[Math.floor(pairs.length / 2)] || [0])[0].toFixed(1));
    push({ name: 'bank similarity: no two presets closer than ' + SIM_MIN_DB + ' dB (spectral fingerprint)', peak: 0, ok: !close.length, problems: close.slice(0, 6) });
  }

  // stress: 16 simultaneous noteOns (triggers voice stealing with MAX_POLY=10) and
  // releases them all at once (triggers tail trimming with MAX_TAILS=12)
  {
    body.appendChild(el('st-cat', 'Stress'));
    let r;
    try {
      loadState({});
      const a = await renderStress(structuredClone(engine.S));
      const problems = [];
      if (a.bad) problems.push(a.bad + ' NaN/Inf samples');
      else if (a.peak <= SILENCE) problems.push('silence (peak ' + dB(a.peak) + ')');
      else if (a.peak > 1.0) problems.push('clipping (peak ' + dB(a.peak) + ')');
      r = { name: '16 notes + voice stealing', peak: a.peak, problems, ok: problems.length === 0 };
    } catch (e) {
      r = { name: '16 notes + voice stealing', peak: 0, problems: ['exception: ' + ((e && e.message) || e)], ok: false };
    }
    push(r);
    ping('i=' + results.length + '&ok=' + (r.ok ? 1 : 0) + '&peak=' + r.peak.toFixed(3) + '&name=stress' +
         (r.ok ? '' : '&why=' + encodeURIComponent(r.problems.join(' | '))));
  }

  // A/B pair probe of the demo bank (?selftest=1&demos=PREFIX):
  // renders the bank presets whose name starts with the prefix and
  // pings the relative diff of each consecutive pair — the QUANTITATIVE
  // evidence that the new parameter changes the sound (bank rule: every
  // improvement comes in with its pair). It runs headless just like the
  // rest: the pings end up in the http.server log.
  const demosPrefix = new URLSearchParams(location.search).get('demos');
  if (demosPrefix) {
    try {
      const bank = await (await fetch('subsdj-demos.json', { cache: 'no-store' })).json();
      const names = Object.keys(bank.presets).filter(n => n.startsWith(demosPrefix));
      // «velocity»: {prefix: v} — pairs that only differ when played softly (velocity sensitivity)
      const velOf = n => { for (const [p, v] of Object.entries(bank.velocity || {})) if (n.startsWith(p)) return v; return 1; };
      const bufs = {};
      for (const n of names) {
        loadState(bank.presets[n]);
        bufs[n] = await renderBuf(structuredClone(engine.S), velOf(n));
      }
      for (let i = 0; i + 1 < names.length; i += 2) {
        const A = names[i], B = names[i + 1];
        const cA = bufs[A].getChannelData(0), cB = bufs[B].getChannelData(0);
        let d = 0, en = 0;
        const len = Math.min(cA.length, cB.length);
        for (let k = 0; k < len; k += 16) { const e = cA[k] - cB[k]; d += e * e; en += cA[k] * cA[k]; }
        const diff = Math.sqrt(d / Math.max(1e-12, en));
        const pA = analyze(bufs[A]), pB = analyze(bufs[B]);
        console.log('demo pair', A, '||', B, 'diff', diff.toFixed(3));
        ping('demo=' + encodeURIComponent(A + ' || ' + B) + '&diff=' + diff.toFixed(3) +
             '&peakA=' + pA.peak.toFixed(3) + '&peakB=' + pB.peak.toFixed(3) +
             ((pA.bad || pB.bad) ? '&bad=1' : ''));
      }
    } catch (e) { ping('demo_error=' + encodeURIComponent((e && e.message) || e)); }
  }

  }   // ---------- end of the «factory» batch ----------

  loadState({});                             // leaves the synth at its default values
  const fails = results.length - ok;
  const secs = ((performance.now() - t0) / 1000).toFixed(1);
  summary.textContent = ok + '/' + results.length + ' ok · ' + secs + ' s';
  document.title = (fails || dups.length ? '✗' : '✓') + ' SELFTEST ' + ok + '/' + results.length + ' · SubSDJ';
  console.table(results.map(r => ({ preset: r.name, ok: r.ok, peak: dB(r.peak), problems: r.problems.join(' · ') || '—' })));
  ping('done=1&ok=' + ok + '&total=' + results.length + '&dups=' + dups.length + '&secs=' + secs);
  return { ok, total: results.length, fails, dups, results };
}
