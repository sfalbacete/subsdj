/* SubSDJ · LEDs de actividad: qué partes del synth están HACIENDO algo.
   "Activo" es computable: casi toda cantidad tiene el 0 como valor inerte
   (esos params llevan act:true en PARAMS, que además atenúa su knob).
   Un LED por sección (en el h2) y otro por fila del banco de LFOs. OJO: un LFO cuenta
   como activo si su Level > 0 O si algún slot de la matriz lo usa en crudo.
   Event-driven: escucha el 'param-change' que ya emite el registro y
   recalcula con debounce de un frame — sin polling. */
import { part } from '../engine/parts.js';
import { MX_SLOTS } from '../engine/params.js';

const srcUsed = (S, id) => { for (let i = 1; i <= MX_SLOTS; i++) if (S['mx' + i + 'src'] === id && S['mx' + i + 'amt']) return true; return false; };
const dstUsed = (S, id) => { for (let i = 1; i <= MX_SLOTS; i++) if (S['mx' + i + 'src'] !== 'off' && S['mx' + i + 'dst'] === id && S['mx' + i + 'amt']) return true; return false; };
const mxAny   = S => { for (let i = 1; i <= MX_SLOTS; i++) if (S['mx' + i + 'src'] !== 'off' && S['mx' + i + 'amt']) return true; return false; };

// Filas del banco de LFOs (por su data-lfo, inmune a los títulos).
const LFOS = {
  pwm:  S => S.pwmLfoLvl > 0 || srcUsed(S, 'lfoPwm'),
  amp:  S => S.ampLfoLvl > 0 || srcUsed(S, 'lfoAmp'),
  freq: S => S.freqLfoLvl > 0 || srcUsed(S, 'lfoFreq'),
  cut:  S => S.cutLfoLvl > 0 || srcUsed(S, 'lfoCut'),
  res:  S => S.resLfoLvl > 0 || srcUsed(S, 'lfoRes'),
  pan:  S => S.panLfoLvl > 0,
};
const anyWave = (S, w) => S.oscA.wave === w || S.oscB.wave === w;
// Secciones (por el título del h2 — OJO: renombrar un h2 obliga a tocar esto):
// "aquí se mueve algo" — extras sobre el camino base (el filtro o el ADSR
// siempre existen; el LED marca movimiento). Cada fila del banco de LFOs
// lleva además su LED.
const PANELES = {
  'Mezcla':          S => S.ring > 0 || S.noise > 0 || S.drift > 0 || ['lvlA', 'lvlB', 'lvlRing', 'lvlNoise'].some(d => dstUsed(S, d)),
  'FM':              S => S.fmIndex > 0 || dstUsed(S, 'fm'),
  'FM4':             S => anyWave(S, 'fm4'),
  'Unison':          S => +S.uniVoices > 1,
  'Tabla de ondas':  S => anyWave(S, 'tabla'),
  'Vocal':           S => S.vocAmt > 0,
  'Resonador':       S => S.resAmt > 0,
  'Filtro':          S => dstUsed(S, 'cutoff') || dstUsed(S, 'reso') || S.filterDrive > 0 || S.keytrack > 0,
  'Env filtro':      S => S.filterEnvAmt !== 0,
  'Env mod':         S => srcUsed(S, 'envm'),
  'Pasos':           S => [1, 2, 3, 4].some(i => srcUsed(S, 'st' + i) || srcUsed(S, 'st' + i + 'n')),
  'Voz · Master':    S => S.pitchEnvAmt !== 0 || S.glide > 0 || S.freqCents !== 0,
  'LFOs':            S => Object.values(LFOS).some(f => f(S)),
  'Matriz':          mxAny,
  'Dist · Flanger':  S => S.dist > 0 || S.flAmt > 0,
  'Chorus':          S => S.chAmt > 0,
  'Delay':           S => S.dlyAmt > 0,
  'Reverb':          S => S.reverbMix > 0,
  'Cinta':           S => S.tapeSat > 0 || S.tapeWow > 0,
  'Espacio':         S => S.width > 0 || dstUsed(S, 'pan'),
  'Arpegiador':      S => S.arpMode !== 'off',
  'Secuenciador':    S => S.seqOn === 'on',
};
// (Lo que NO hace nada con la configuración actual se apaga en ui/deps.js.)

export function initActivity() {
  const leds = [];
  const mkLed = () => { const s = document.createElement('span'); s.className = 'led'; return s; };
  for (const h2 of document.querySelectorAll('.panel h2')) {
    const test = PANELES[h2.textContent.trim()];
    if (test) { const led = mkLed(); h2.prepend(led); leds.push({ el: led, test }); }
  }
  for (const row of document.querySelectorAll('.lfo-row[data-lfo]')) {
    const test = LFOS[row.dataset.lfo], rn = row.querySelector('.rn');
    if (test && rn) { const led = mkLed(); rn.prepend(led); leds.push({ el: led, test }); }
  }
  let pending = false;
  const refresh = () => {
    pending = false;
    const S = part().S;
    for (const l of leds) l.el.classList.toggle('on', !!l.test(S));
  };
  document.addEventListener('param-change', () => {
    if (!pending) { pending = true; requestAnimationFrame(refresh); }
  });
  refresh();
}
