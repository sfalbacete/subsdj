/* SubSDJ · LEDs de actividad: qué partes del synth están HACIENDO algo.
   "Activo" es computable: casi toda cantidad tiene el 0 como valor inerte
   (esos params llevan act:true en PARAMS, que además atenúa su knob).
   Un LED por panel (en el h2) y otro por grupo de LFO. OJO: un LFO cuenta
   como activo si su Level > 0 O si algún slot de la matriz lo usa en crudo.
   Event-driven: escucha el 'param-change' que ya emite el registro y
   recalcula con debounce de un frame — sin polling. */
import { part } from '../engine/parts.js';
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
// Módulos (por el título del h2 — OJO: renombrar un h2 obliga a tocar esto):
// "aquí se mueve algo" — extras sobre el camino base (el filtro o el ADSR
// siempre existen; el LED marca movimiento). Los módulos de LFO llevan
// además su LED de tag (anclado por data-shape, inmune a los títulos).
const PANELES = {
  'Mezcla':                S => S.ring > 0 || S.noise > 0 || S.drift > 0,
  'FM':                    S => S.fmIndex > 0 || dstUsed(S, 'fm'),
  'FM4':                   S => S.oscA.wave === 'fm4' || S.oscB.wave === 'fm4',
  'Unison':                S => +S.uniVoices > 1,
  'Tabla de ondas':        S => S.oscA.wave === 'tabla' || S.oscB.wave === 'tabla',
  'Vocal':                 S => S.vocAmt > 0,
  'Filtro':                S => dstUsed(S, 'cutoff') || dstUsed(S, 'reso'),
  'LFO cutoff':            S => LFOS.cutLfoShape(S),
  'LFO reso':              S => LFOS.resLfoShape(S),
  'Filtro · carácter':     S => S.filterDrive > 0 || S.keytrack > 0,
  'Env filtro':            S => S.filterEnvAmt !== 0,
  'LFO PWM':               S => LFOS.pwmLfoShape(S),
  'LFO trémolo':           S => LFOS.ampLfoShape(S),
  'LFO vibrato':           S => LFOS.freqLfoShape(S) || S.freqCents !== 0,
  'Voz · Master':          S => S.pitchEnvAmt !== 0 || S.glide > 0,
  'Distorsión · Flanger':  S => S.dist > 0 || S.flAmt > 0,
  'Chorus / Ensemble':     S => S.chAmt > 0,
  'Delay':                 S => S.dlyAmt > 0,
  'Espacio':               S => S.width > 0 || S.panLfoLvl > 0 || dstUsed(S, 'pan'),
  'Reverb':                S => S.reverbMix > 0,
  'Arpegiador':            S => S.arpMode !== 'off',
  'Secuenciador':          S => S.seqOn === 'on',
  'Matriz de modulación':  mxAny,
};

// Módulos que se APAGAN (atenuados, sin puntero) cuando su condición de uso
// no se cumple: FM solo muerde sobre osciladores en «Seno», el PWM sobre «Cuad.»
const APAGA = {
  'FM':      S => S.oscA.wave === 'sine' || S.oscB.wave === 'sine',
  'FM4':     S => S.oscA.wave === 'fm4' || S.oscB.wave === 'fm4',
  'LFO PWM': S => S.oscA.wave === 'square' || S.oscB.wave === 'square',
};

export function initActivity() {
  const leds = [], apagables = [];
  const mkLed = () => { const s = document.createElement('span'); s.className = 'led'; return s; };
  for (const h2 of document.querySelectorAll('.panel h2')) {
    const titulo = h2.textContent.trim();
    const test = PANELES[titulo];
    if (test) { const led = mkLed(); h2.prepend(led); leds.push({ el: led, test }); }
    if (APAGA[titulo]) apagables.push({ el: h2.closest('.panel'), test: APAGA[titulo] });
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
    const S = part().S;
    for (const l of leds) l.el.classList.toggle('on', !!l.test(S));
    for (const a of apagables) a.el.classList.toggle('mod-off', !a.test(S));
  };
  document.addEventListener('param-change', () => {
    if (!pending) { pending = true; requestAnimationFrame(refresh); }
  });
  refresh();
}
