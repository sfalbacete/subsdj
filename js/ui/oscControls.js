/* SubSDJ · selectores de onda + steppers de octavas + segmentos (modo de voz,
   envolvente de filtro). Defaults desde PARAMS (el HTML no marca .active). */
import { engine } from '../engine/AudioEngine.js';
import { PARAMS } from '../engine/params.js';
import { CONTROLS, applyTarget } from './registry.js';

// Segmento genérico de botones: <button data-KEY="valor">. Registra el control
// canónico `name` y aplica al target del motor.
function bindSeg(segId, key, name, target) {
  const seg = document.getElementById(segId);
  if (!seg) return;
  const select = b => {
    seg.querySelectorAll('button').forEach(x => x.classList.remove('active'));
    b.classList.add('active');
    applyTarget(target, b.dataset[key]);
  };
  seg.querySelectorAll('button').forEach(b => b.addEventListener('click', () => select(b)));
  CONTROLS[name] = {
    get: () => seg.querySelector('button.active').dataset[key],
    set: v => { const b = seg.querySelector('button[data-' + key + '="' + v + '"]'); if (b) select(b); },
    def: PARAMS[name].def,
  };
  CONTROLS[name].set(PARAMS[name].def);
}

// Botón de forma de onda de LFO: cicla sin→tri→saw→sqr con cada clic.
const SHAPES = ['sine', 'triangle', 'sawtooth', 'square'];
const SHAPE_LABEL = { sine: 'sin', triangle: 'tri', sawtooth: 'saw', square: 'sqr' };
function bindLfoShapes() {
  document.querySelectorAll('.lfoShape').forEach(btn => {
    const name = btn.dataset.shape;
    if (!PARAMS[name]) return;
    const set = v => {
      if (!SHAPES.includes(v)) v = 'sine';
      btn.dataset.cur = v; btn.textContent = SHAPE_LABEL[v];
      applyTarget(name, v);
    };
    btn.addEventListener('click', () => { engine.resume(); set(SHAPES[(SHAPES.indexOf(btn.dataset.cur) + 1) % SHAPES.length]); });
    CONTROLS[name] = { get: () => btn.dataset.cur, set, def: PARAMS[name].def };
    set(PARAMS[name].def);
  });
}

function setOctave(which, n) {
  const p = PARAMS['octaves' + which.slice(3)];
  n = Math.min(p.max, Math.max(p.min, n));
  applyTarget(which + '.octaves', n);
  const el = document.getElementById('oct' + which.slice(3));
  if (el) el.textContent = n;
}

export function bindOscControls() {
  bindSeg('waveA', 'w', 'waveA', 'oscA.wave');
  bindSeg('waveB', 'w', 'waveB', 'oscB.wave');
  bindSeg('modeSel', 'mode', 'mode', 'mode');              // Poli / Mono (legato)
  bindSeg('fenvModeSel', 'fenv', 'fenvMode', 'fenvMode');  // env filtro: =Amp / Propia
  bindSeg('dlySyncSel', 'sync', 'dlySync', 'dlySync');     // delay: libre / división del BPM
  bindSeg('chModeSel', 'chm', 'chMode', 'chMode');         // chorus 2 líneas / ensemble 3 fases
  bindSeg('arpModeSel', 'arp', 'arpMode', 'arpMode');      // arpegiador
  bindSeg('arpDivSel', 'div', 'arpDiv', 'arpDiv');
  bindSeg('arpOctSel', 'aoct', 'arpOct', 'arpOct');
  bindLfoShapes();

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
}
