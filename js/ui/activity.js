/* SubSDJ · LEDs de actividad: qué partes del synth están HACIENDO algo.
   "Activo" es computable: casi toda cantidad tiene el 0 como valor inerte
   (esos params llevan act:true en PARAMS, que además atenúa su knob).
   Un LED por panel (en el h2: sobrevive al plegado — el panel puede quedar
   plegado y seguir "chivando") y otro por grupo de LFO. OJO: un LFO cuenta
   como activo si su Level > 0 O si algún slot de la matriz lo usa en crudo.
   Event-driven: escucha el 'param-change' que ya emite el registro y
   recalcula con debounce de un frame — sin polling. */
import { engine } from '../engine/AudioEngine.js';
import { MX_SLOTS } from '../engine/params.js';

const srcUsed = (S, id) => { for (let i = 1; i <= MX_SLOTS; i++) if (S['mx' + i + 'src'] === id && S['mx' + i + 'amt']) return true; return false; };
const dstUsed = (S, id) => { for (let i = 1; i <= MX_SLOTS; i++) if (S['mx' + i + 'src'] !== 'off' && S['mx' + i + 'dst'] === id && S['mx' + i + 'amt']) return true; return false; };
const mxAny   = S => { for (let i = 1; i <= MX_SLOTS; i++) if (S['mx' + i + 'src'] !== 'off' && S['mx' + i + 'amt']) return true; return false; };

// Grupos de LFO: la forma (data-shape del botón) identifica al .lfo-grp.
const LFOS = {
  pwmLfoShape:  S => S.pwmLfoLvl > 0 || srcUsed(S, 'lfoPwm'),
  ampLfoShape:  S => S.ampLfoLvl > 0 || srcUsed(S, 'lfoAmp'),
  freqLfoShape: S => S.freqLfoLvl > 0 || srcUsed(S, 'lfoFreq'),
  cutLfoShape:  S => S.cutLfoLvl > 0 || srcUsed(S, 'lfoCut'),
  resLfoShape:  S => S.resLfoLvl > 0 || srcUsed(S, 'lfoRes'),
};
// Paneles (por el título del h2): "aquí se mueve algo" — extras sobre el
// camino base (el filtro o el ADSR siempre existen; el LED marca movimiento).
const PANELES = {
  'Osciladores':           S => S.ring > 0 || S.noise > 0 || S.fmIndex > 0 || +S.uniVoices > 1 || S.drift > 0,
  'Modulación':            S => LFOS.pwmLfoShape(S) || LFOS.ampLfoShape(S) || LFOS.freqLfoShape(S) || S.freqCents !== 0,
  'Filtro (por voz)':      S => LFOS.cutLfoShape(S) || LFOS.resLfoShape(S) || S.filterEnvAmt !== 0 ||
                                S.filterDrive > 0 || S.keytrack > 0 || dstUsed(S, 'cutoff') || dstUsed(S, 'reso'),
  'FX':                    S => S.dist > 0 || S.flAmt > 0 || S.chAmt > 0 || S.dlyAmt > 0,
  'Espacio':               S => S.width > 0 || S.panLfoLvl > 0 || S.reverbMix > 0 || dstUsed(S, 'pan'),
  'Envelope ADSR':         S => S.pitchEnvAmt !== 0 || S.glide > 0,
  'Arpegiador':            S => S.arpMode !== 'off',
  'Secuenciador':          S => S.seqOn === 'on',
  'Matriz de modulación':  mxAny,
};

export function initActivity() {
  const leds = [];
  const mkLed = () => { const s = document.createElement('span'); s.className = 'led'; return s; };
  for (const h2 of document.querySelectorAll('.panel h2')) {
    const test = PANELES[h2.textContent.trim()];
    if (!test) continue;
    const led = mkLed(); h2.prepend(led); leds.push({ el: led, test });
  }
  for (const btn of document.querySelectorAll('.lfoShape')) {
    const test = LFOS[btn.dataset.shape];
    const tag = btn.closest('.lfo-grp')?.querySelector('.tag');
    if (!test || !tag) continue;
    const led = mkLed(); tag.prepend(led); leds.push({ el: led, test });
  }
  let pending = false;
  const refresh = () => {
    pending = false;
    const S = engine.S;
    for (const l of leds) l.el.classList.toggle('on', !!l.test(S));
  };
  document.addEventListener('param-change', () => {
    if (!pending) { pending = true; requestAnimationFrame(refresh); }
  });
  refresh();
}
