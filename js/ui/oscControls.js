/* SubSDJ · selectores de onda + steppers de octavas + segmentos (modo de voz,
   envolvente de filtro) + selector de tabla de ondas. Defaults desde PARAMS
   (el HTML no marca .active). */
import { engine } from '../engine/AudioEngine.js';
import { PARAMS } from '../engine/params.js';
import { WT_SETS } from '../engine/wavetable.js';
import { CONTROLS, applyTarget } from './registry.js';

// Segmento genérico de botones: <button data-KEY="valor">. Registra el control
// canónico `name` y aplica al target del motor.
export function bindSeg(segId, key, name, target) {
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
    el: seg,
    opts: [...seg.querySelectorAll('button')].map(b => b.dataset[key]),   // zonas para midimap
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
    CONTROLS[name] = { get: () => btn.dataset.cur, set, def: PARAMS[name].def, el: btn, opts: SHAPES };
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
  bindSeg('filterSlopeSel', 'slope', 'filterSlope', 'filterSlope');  // 12 / 24 dB por octava
  bindSeg('dlySyncSel', 'sync', 'dlySync', 'dlySync');     // delay: libre / división del BPM
  bindSeg('chModeSel', 'chm', 'chMode', 'chMode');         // chorus 2 líneas / ensemble 3 fases
  bindSeg('uniVoicesSel', 'uv', 'uniVoices', 'uniVoices'); // unison: nº de copias por oscilador
  bindSeg('arpModeSel', 'arp', 'arpMode', 'arpMode');      // arpegiador
  bindSeg('arpDivSel', 'div', 'arpDiv', 'arpDiv');
  bindSeg('arpOctSel', 'aoct', 'arpOct', 'arpOct');
  bindLfoShapes();

  // Selector de tabla de ondas (los sets viven en engine/wavetable.js)
  const wtSel = document.getElementById('wtSetSel');
  if (wtSel) {
    for (const n of Object.keys(WT_SETS)) wtSel.add(new Option(n, n));
    wtSel.addEventListener('change', () => { engine.resume(); applyTarget('wtSet', wtSel.value); });
    CONTROLS.wtSet = {
      get: () => wtSel.value,
      set: v => { if ([...wtSel.options].some(o => o.value === v)) wtSel.value = v; applyTarget('wtSet', wtSel.value); },
      def: PARAMS.wtSet.def, el: wtSel, opts: Object.keys(WT_SETS),
    };
    CONTROLS.wtSet.set(PARAMS.wtSet.def);
  }

  document.querySelectorAll('.stepper button').forEach(b => {
    b.addEventListener('click', () => {
      if (!b.dataset.oct) return;                    // otros steppers (p.ej. pasos del seq) se cablean aparte
      const which = 'osc' + b.dataset.oct;
      setOctave(which, engine.S[which].octaves + parseInt(b.dataset.d, 10));
    });
  });
  ['A', 'B'].forEach(s => {
    CONTROLS['octaves' + s] = { get: () => engine.S['osc' + s].octaves, set: n => setOctave('osc' + s, n), def: PARAMS['octaves' + s].def,
      el: document.getElementById('oct' + s).closest('.ctl'), opts: [1, 2, 3, 4] };
    setOctave('osc' + s, PARAMS['octaves' + s].def);
  });
}
