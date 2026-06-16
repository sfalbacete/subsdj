/* SubSDJ · knobs rotatorios (arrastre vertical) */
import { engine } from '../engine/AudioEngine.js';
import { CONTROLS, applyTarget } from './registry.js';

export const KNOBS = {
  detuneA:   { min: -50, max: 50,  def: 0,   unit: ' ct', t: 'oscA.detune' },
  phaseA:    { min: 0,   max: 360, def: 0,   unit: '°',   t: 'oscA.phase' },
  detuneB:   { min: -50, max: 50,  def: 7,   unit: ' ct', t: 'oscB.detune' },
  phaseB:    { min: 0,   max: 360, def: 0,   unit: '°',   t: 'oscB.phase' },
  mix:       { min: 0,   max: 1,   def: 0.4, unit: '',    t: 'mix' },
  ring:      { min: 0,   max: 1,   def: 0,   unit: '',    t: 'ring' },
  noise:     { min: 0,   max: 1,   def: 0,   unit: '',    t: 'noise' },
  spread:    { min: 0,   max: 1,   def: 0.5, unit: '',    t: 'spread' },
  pwmLfoLvl: { min: 0,   max: 0.45,def: 0,   unit: '',    t: 'pwmLfoLvl' },
  pwmLfoSpd: { min: 0.05,max: 20,  def: 3,   unit: ' Hz', t: 'pwmLfoSpd' },
  ampLfoLvl: { min: 0,   max: 0.6, def: 0,   unit: '',    t: 'ampLfoLvl' },
  ampLfoSpd: { min: 0.05,max: 20,  def: 5,   unit: ' Hz', t: 'ampLfoSpd' },
  freqLfoLvl:{ min: 0,   max: 200, def: 0,   unit: ' ct', t: 'freqLfoLvl' },
  freqLfoSpd:{ min: 0.05,max: 20,  def: 5,   unit: ' Hz', t: 'freqLfoSpd' },
  cutLfoLvl: { min: 0,   max: 5000,def: 0,   unit: ' Hz', t: 'cutLfoLvl' },
  cutLfoSpd: { min: 0.05,max: 20,  def: 2,   unit: ' Hz', t: 'cutLfoSpd' },
  resLfoLvl: { min: 0,   max: 15,  def: 0,   unit: '',    t: 'resLfoLvl' },
  resLfoSpd: { min: 0.05,max: 20,  def: 2,   unit: ' Hz', t: 'resLfoSpd' },
  morph:     { min: 0,   max: 1,   def: 0,   unit: '',    t: 'morph' },
  filterEnvAmt:{ min: -6000, max: 6000, def: 0, unit: ' Hz', t: 'filterEnvAmt' },
  dist:      { min: 0,   max: 1,   def: 0,   unit: '',    t: 'dist' },
  flAmt:     { min: 0,   max: 1,   def: 0,   unit: '',    t: 'flAmt' },
  flSpd:     { min: 0.05,max: 8,   def: 0.3, unit: ' Hz', t: 'flSpd' },
  dlyAmt:    { min: 0,   max: 0.9, def: 0,   unit: '',    t: 'dlyAmt' },
  dlyTime:   { min: 0.02,max: 1.5, def: 0.3, unit: ' s',  t: 'dlyTime' },
  glide:     { min: 0,   max: 1,   def: 0,   unit: ' s',  t: 'glide' },
  width:     { min: 0,   max: 1,   def: 0,   unit: '',    t: 'width' },
  reverbMix: { min: 0,   max: 0.6, def: 0,   unit: '',    t: 'reverbMix' },
  reverbSize:{ min: 0.2, max: 4,   def: 1.8, unit: ' s',  t: 'reverbSize' },
};

function fmt(v, unit) {
  const a = Math.abs(v);
  const s = a >= 100 ? v.toFixed(0) : (a >= 10 ? v.toFixed(1) : v.toFixed(2));
  return s + unit;
}

export function bindKnobs() {
  document.querySelectorAll('.knob').forEach(el => {
    const cfg = KNOBS[el.dataset.knob];
    if (!cfg) return;
    const ind = el.querySelector('.ind');
    const valEl = el.parentElement.querySelector('.val');
    let value = cfg.def;
    const render = () => {
      const pos = (value - cfg.min) / (cfg.max - cfg.min);
      ind.style.transform = `rotate(${-135 + pos * 270}deg)`;
      if (valEl) valEl.textContent = fmt(value, cfg.unit);
    };
    const setVal = v => { value = Math.min(cfg.max, Math.max(cfg.min, v)); render(); applyTarget(cfg.t, value); };
    render(); applyTarget(cfg.t, value);

    let startY = 0, startV = 0, dragging = false;
    el.addEventListener('pointerdown', e => {
      engine.resume(); dragging = true; startY = e.clientY; startV = value;
      el.setPointerCapture(e.pointerId); e.preventDefault();
    });
    el.addEventListener('pointermove', e => {
      if (!dragging) return;
      const dy = startY - e.clientY, span = cfg.max - cfg.min, fine = e.shiftKey ? 0.25 : 1;
      setVal(startV + dy * (span / 200) * fine);
    });
    const end = e => { dragging = false; try { el.releasePointerCapture(e.pointerId); } catch (_) {} };
    el.addEventListener('pointerup', end);
    el.addEventListener('pointercancel', end);
    el.addEventListener('dblclick', () => setVal(cfg.def));
    CONTROLS[el.dataset.knob] = { get: () => value, set: v => setVal(v), def: cfg.def };
  });
}
