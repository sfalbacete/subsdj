/* SubSDJ · selectores de onda, octava y apiladas + segmentos (modo de voz,
   envolvente de filtro…) + selector de tabla de ondas. Defaults desde PARAMS
   (el HTML no marca .active). Un seg puede verse como botonera, como
   selector giratorio (.rot, ui/rotary.js) o como conmutador con LED (.tog):
   para bindSeg es lo mismo, una fila de <button data-KEY>. */
import { part } from '../engine/parts.js';
import { PARAMS, LFO_DIVS } from '../engine/params.js';
import { WT_SETS } from '../engine/wavetable.js';
import { CONTROLS, applyTarget, bindSelect } from './registry.js';

// Segmento genérico de botones: <button data-KEY="valor">. Registra el control
// canónico `name` y aplica al target del motor. num: el valor es un número
// (octava, apiladas): se aplica y se guarda como número, no como texto.
export function bindSeg(segId, key, name, target, num = false) {
  const seg = document.getElementById(segId);
  if (!seg) return;
  const val = b => (num ? +b.dataset[key] : b.dataset[key]);
  const select = b => {
    seg.querySelectorAll('button').forEach(x => x.classList.remove('active'));
    b.classList.add('active');
    applyTarget(target, val(b));
  };
  seg.querySelectorAll('button').forEach(b => b.addEventListener('click', () => select(b)));
  CONTROLS[name] = {
    get: () => val(seg.querySelector('button.active')),
    set: v => { const b = seg.querySelector('button[data-' + key + '="' + v + '"]'); if (b) select(b); },
    def: PARAMS[name].def,
    el: seg,
    opts: [...seg.querySelectorAll('button')].map(val),   // zonas para midimap
  };
  CONTROLS[name].set(PARAMS[name].def);
}

// Botón de forma de onda de LFO: cicla sin→tri→saw→sqr→S&H→deriva con cada clic
// (S&H = escalones aleatorios a la velocidad del LFO; deriva = random suave y lento).
const SHAPES = ['sine', 'triangle', 'sawtooth', 'square', 'sh', 'drift'];
const SHAPE_LABEL = { sine: 'sin', triangle: 'tri', sawtooth: 'saw', square: 'sqr', sh: 'S&H', drift: 'deriva' };
function bindLfoShapes() {
  document.querySelectorAll('.lfoShape').forEach(btn => {
    const name = btn.dataset.shape;
    if (!PARAMS[name]) return;
    const set = v => {
      if (!SHAPES.includes(v)) v = 'sine';
      btn.dataset.cur = v; btn.textContent = SHAPE_LABEL[v];
      applyTarget(name, v);
    };
    btn.addEventListener('click', () => { part().resume(); set(SHAPES[(SHAPES.indexOf(btn.dataset.cur) + 1) % SHAPES.length]); });
    CONTROLS[name] = { get: () => btn.dataset.cur, set, def: PARAMS[name].def, el: btn, opts: SHAPES };
    set(PARAMS[name].def);
  });
}

// ❄ Freeze de la Sala: gesto de ejecución, no parámetro del preset (una cola
// congelada no tiene sentido guardada). Solo con Placa: con la IR el botón se
// desactiva. Pánico/Escape la sueltan (keyboard.panic emite 'freeze-changed').
function bindFreeze() {
  const fz = document.getElementById('freezeBtn');
  if (!fz) return;
  const paint = () => { const s = part().sala; fz.classList.toggle('on', !!(s && s.frozen)); };
  fz.addEventListener('click', () => { part().resume(); const s = part().sala; if (s) s.setFreeze(!s.frozen); paint(); });
  document.addEventListener('freeze-changed', paint);
  document.addEventListener('param-change', e => { if (e.detail.target === 'reverbType') { fz.disabled = e.detail.value !== 'placa'; paint(); } });
  fz.disabled = PARAMS.reverbType.def !== 'placa';
}

// Sync del Osc A (Roadmap 7.0 · 3.2): un botón en la cabecera del módulo que
// alterna off / on. No pliega el módulo (el clic en la cabecera lo haría).
function bindSync() {
  const b = document.getElementById('syncA'); if (!b) return;
  const on = () => b.classList.contains('active');
  const set = v => { b.classList.toggle('active', v === 'on'); b.setAttribute('aria-pressed', String(v === 'on')); applyTarget('syncA', v === 'on' ? 'on' : 'off'); };
  b.addEventListener('click', e => { e.stopPropagation(); part().resume(); set(on() ? 'off' : 'on'); });
  CONTROLS.syncA = { get: () => (on() ? 'on' : 'off'), set, def: PARAMS.syncA.def, el: b, opts: ['off', 'on'] };
  set(PARAMS.syncA.def);
}

export function bindOscControls() {
  bindSync();
  bindSeg('waveA', 'w', 'waveA', 'oscA.wave');
  bindSeg('waveB', 'w', 'waveB', 'oscB.wave');
  bindSeg('modeSel', 'mode', 'mode', 'mode');              // Poli / Mono
  bindSeg('monoTrigSel', 'trig', 'monoTrig', 'monoTrig');  // Disparo en Mono: legato / cada nota
  bindSeg('fenvModeSel', 'fenv', 'fenvMode', 'fenvMode');  // env filtro: =Amp / Propia
  bindSeg('filterSlopeSel', 'slope', 'filterSlope', 'filterSlope');  // 12 / 24 dB por octava
  bindSeg('filterTypeSel', 'ftype', 'filterType', 'filterType');     // LP↔HP / BP / Notch (estructura: por nota)
  bindSeg('driveCharSel', 'dchar', 'driveChar', 'driveChar');      // drive suave (tanh) / plegado (en vivo)
  bindSeg('envmModeSel', 'envm', 'envmMode', 'envmMode');           // Env mod: normal / bucle / disparo (por nota)
  bindSeg('dlySyncSel', 'sync', 'dlySync', 'dlySync');     // delay: libre / división del BPM
  bindSeg('chModeSel', 'chm', 'chMode', 'chMode');         // chorus 2 líneas / ensemble 3 fases
  bindSeg('reverbTypeSel', 'rt', 'reverbType', 'reverbType');   // reverb: sala (IR) / placa (Dattorro)
  bindSeg('fm4AlgSel', 'alg', 'fm4Alg', 'fm4Alg');              // FM4: algoritmo (quién modula a quién)
  bindSeg('uniVoicesSel', 'uv', 'uniVoices', 'uniVoices'); // unison: nº de copias por oscilador
  const ph = document.getElementById('lfoPhaseSel');   // LFOs: fase global / por voz (Weyl) / reinicio / una vez (Roadmap 7.0 · 2.2)
  if (ph) bindSelect(ph, 'lfoPhase', [{ id: 'global', label: 'global' }, { id: 'voz', label: 'por voz' }, { id: 'reinicio', label: 'reinicio' }, { id: 'una', label: 'una vez' }]);
  const divs = [{ id: 'libre', label: 'libre' }, ...Object.keys(LFO_DIVS).map(d => ({ id: d, label: d }))];
  document.querySelectorAll('select.lfoSync').forEach(sel => bindSelect(sel, sel.dataset.sync, divs));   // LFO a tempo
  bindSeg('shimIntSel', 'shi', 'shimInt', 'shimInt');      // shimmer: intervalo del desplazador (clave de la Sala)
  bindFreeze();
  bindSeg('arpModeSel', 'arp', 'arpMode', 'arpMode');      // arpegiador
  bindSeg('arpDivSel', 'div', 'arpDiv', 'arpDiv');
  bindSeg('arpOctSel', 'aoct', 'arpOct', 'arpOct');
  bindLfoShapes();

  // Selector de tabla de ondas (los sets viven en engine/wavetable.js)
  const wtSel = document.getElementById('wtSetSel');
  if (wtSel) {
    for (const n of Object.keys(WT_SETS)) wtSel.add(new Option(n, n));
    wtSel.addEventListener('change', () => { part().resume(); applyTarget('wtSet', wtSel.value); });
    CONTROLS.wtSet = {
      get: () => wtSel.value,
      set: v => { if ([...wtSel.options].some(o => o.value === v)) wtSel.value = v; applyTarget('wtSet', wtSel.value); },
      def: PARAMS.wtSet.def, el: wtSel, opts: Object.keys(WT_SETS),
    };
    CONTROLS.wtSet.set(PARAMS.wtSet.def);
  }

  // Octava (oct: transposición −2..+2, en pies: 16' = suboscilador) y Apiladas
  // (octaves: 1-4 octavas hacia arriba dentro del oscilador): selectores numéricos
  ['A', 'B'].forEach(s => {
    bindSeg('osc' + s + 'Oct', 'oct', 'oct' + s, 'osc' + s + '.oct', true);
    bindSeg('osc' + s + 'Stack', 'stk', 'octaves' + s, 'osc' + s + '.octaves', true);
  });
}
