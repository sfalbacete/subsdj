/* SubSDJ · selectores de onda + steppers de octavas + modo de voz.
   Defaults desde PARAMS (el HTML ya no marca .active). */
import { engine } from '../engine/AudioEngine.js';
import { PARAMS } from '../engine/params.js';
import { CONTROLS, applyTarget } from './registry.js';

function bindWave(segId, which) {
  const seg = document.getElementById(segId);
  if (!seg) return;
  const name = 'wave' + which.slice(3);
  const select = b => {
    seg.querySelectorAll('button').forEach(x => x.classList.remove('active'));
    b.classList.add('active');
    applyTarget(which + '.wave', b.dataset.w);
  };
  seg.querySelectorAll('button').forEach(b => b.addEventListener('click', () => select(b)));
  CONTROLS[name] = {
    get: () => seg.querySelector('button.active').dataset.w,
    set: w => { const b = seg.querySelector('button[data-w="' + w + '"]'); if (b) select(b); },
    def: PARAMS[name].def,
  };
  CONTROLS[name].set(PARAMS[name].def);
}

function setOctave(which, n) {
  const p = PARAMS['octaves' + which.slice(3)];
  n = Math.min(p.max, Math.max(p.min, n));
  applyTarget(which + '.octaves', n);
  const el = document.getElementById('oct' + which.slice(3));
  if (el) el.textContent = n;
}

export function bindOscControls() {
  bindWave('waveA', 'oscA');
  bindWave('waveB', 'oscB');

  document.querySelectorAll('.stepper button').forEach(b => {
    b.addEventListener('click', () => {
      const which = 'osc' + b.dataset.oct;
      setOctave(which, engine.S[which].octaves + parseInt(b.dataset.d, 10));
    });
  });
  ['A', 'B'].forEach(s => {
    CONTROLS['octaves' + s] = { get: () => engine.S['osc' + s].octaves, set: n => setOctave('osc' + s, n), def: PARAMS['octaves' + s].def };
    setOctave('osc' + s, PARAMS['octaves' + s].def);
  });

  // Toggle de modo de voz (Poli / Mono)
  const modeSeg = document.getElementById('modeSel');
  if (modeSeg) {
    const selectMode = b => {
      modeSeg.querySelectorAll('button').forEach(x => x.classList.remove('active'));
      b.classList.add('active');
      applyTarget('mode', b.dataset.mode);
    };
    modeSeg.querySelectorAll('button').forEach(b => b.addEventListener('click', () => selectMode(b)));
    CONTROLS['mode'] = {
      get: () => modeSeg.querySelector('button.active').dataset.mode,
      set: m => { const b = modeSeg.querySelector('button[data-mode="' + m + '"]'); if (b) selectMode(b); },
      def: PARAMS.mode.def,
    };
    CONTROLS['mode'].set(PARAMS.mode.def);
  }
}
