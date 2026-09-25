/* =====================================================================
   SubSDJ · UI de la escena generativa: módulo «Armonía» (raíz, escala,
   progresión, modo lista/funciones, semilla, ▶ Tocar) y módulo «Jugador»
   (el jugador de la parte que edita el rack: modo + sus knobs). Solo
   visibles con la escena encendida (partsControls los muestra/oculta).
   Los ajustes viven en el director de la escena (engine/Conductor.js), no
   en los presets: el preset es el instrumento, el jugador es el músico.
   ===================================================================== */
import { part, getScene } from '../engine/parts.js';
import { ESCALAS, NOTAS, GRADOS, parseProg } from '../engine/Harmony.js';
import { PLAYER_MODES } from '../engine/Player.js';
import { attachKnob } from './knobs.js';

const $ = id => document.getElementById(id);
const conductor = () => { const sc = getScene(); return sc ? sc.conductor : null; };
const int = v => String(Math.round(v));
// knobs por modo: [clave, etiqueta, min, max, entero?]
const KNOBS = {
  pulso:   [['k', 'Golpes', 1, 16, 1], ['n', 'Pasos', 4, 32, 1], ['rot', 'Rot', 0, 31, 1], ['prob', 'Prob', 0, 1],
            ['gate', 'Gate', 0.05, 1], ['acento', 'Acento', 0, 1], ['oct', 'Oct', 1, 7, 1], ['vel', 'Vel', 0.1, 1]],
  acorde:  [['notas', 'Notas', 3, 4, 1], ['oct', 'Oct', 1, 7, 1], ['vel', 'Vel', 0.1, 1]],
  melodia: [['densidad', 'Densidad', 0, 1], ['silencio', 'Silencio', 0, 1], ['gravedad', 'Gravedad', 0, 1],
            ['rango', 'Rango', 1, 3, 1], ['legato', 'Legato', 0.1, 1], ['oct', 'Oct', 1, 7, 1], ['vel', 'Vel', 0.1, 1]],
  raiz:    [['quinta', 'Quinta', 0, 1, 1], ['cada', 'Cada', 1, 8, 1], ['oct', 'Oct', 1, 7, 1], ['vel', 'Vel', 0.1, 1]],
};
let infoTimer = null;

function currentPlayer() { const sc = getScene(); return sc ? sc.conductor.players[sc.sel] : null; }

function buildPlayerUI() {
  const sc = getScene(), pl = currentPlayer(); if (!pl) return;
  const p = sc.parts[sc.sel];
  $('playerWho').textContent = 'Parte ' + (sc.sel + 1) + (p.presetName ? ' · ' + p.presetName : '');
  document.querySelectorAll('#playerMode button').forEach(b => b.classList.toggle('active', b.dataset.pm === pl.cfg.mode));
  const host = $('playerKnobs'); host.innerHTML = '';
  for (const [key, lab, min, max, isInt] of (KNOBS[pl.cfg.mode] || [])) {
    const ctl = document.createElement('div'); ctl.className = 'ctl';
    ctl.innerHTML = `<div class="knob"><div class="ind"></div></div><div class="lab">${lab}</div><div class="val"></div>`;
    host.appendChild(ctl);
    attachKnob(ctl.querySelector('.knob'), { min, max, def: pl.cfg[key], fmt: isInt ? int : undefined },
               v => { pl.cfg[key] = isInt ? Math.round(v) : v; });
  }
}

function syncHarmonyUI() {
  const c = conductor(); if (!c) return;
  const h = c.harmony;
  $('harmRoot').value = h.root; $('harmScale').value = h.scale;
  $('harmProg').value = h.prog.join(' '); $('harmBars').textContent = h.bars;
  document.querySelectorAll('#harmModo button').forEach(b => b.classList.toggle('active', b.dataset.m === h.modo));
  $('harmSeed').value = c.seed;
  setPlayBtn(c.running);
}
function setPlayBtn(on) {
  const b = $('playBtn'); b.textContent = on ? '■ Parar' : '▶ Tocar'; b.classList.toggle('on', on);
  if (!on) $('harmInfo').textContent = 'parado';
}
function refreshInfo() {
  const c = conductor(); if (!c || !c.running) return;
  const bar = c.barNow(), ch = c.harmony.chordAt(bar);
  $('harmInfo').textContent = 'compás ' + (bar + 1) + ' · ' + (GRADOS[ch.degree - 1] || ch.degree) + ' · ' + NOTAS[ch.rootPc];
}

export function initPlayerControls() {
  const rootSel = $('harmRoot'), scaleSel = $('harmScale'); if (!rootSel) return;
  NOTAS.forEach((n, i) => rootSel.add(new Option(n, i)));
  Object.keys(ESCALAS).forEach(k => scaleSel.add(new Option(k, k)));
  rootSel.addEventListener('change', () => { const c = conductor(); if (c) c.harmony.root = +rootSel.value; });
  scaleSel.addEventListener('change', () => { const c = conductor(); if (c) c.harmony.scale = scaleSel.value; });
  $('harmProg').addEventListener('change', () => { const c = conductor(); if (!c) return; c.harmony.prog = parseProg($('harmProg').value); $('harmProg').value = c.harmony.prog.join(' '); });
  document.querySelectorAll('[data-hbar]').forEach(b => b.addEventListener('click', () => {
    const c = conductor(); if (!c) return;
    c.harmony.bars = Math.max(1, Math.min(8, c.harmony.bars + (+b.dataset.hbar)));
    $('harmBars').textContent = c.harmony.bars;
  }));
  document.querySelectorAll('#harmModo button').forEach(b => b.addEventListener('click', () => {
    const c = conductor(); if (!c) return;
    c.harmony.modo = b.dataset.m;
    document.querySelectorAll('#harmModo button').forEach(x => x.classList.toggle('active', x === b));
  }));
  $('harmSeed').addEventListener('change', () => { const c = conductor(); if (c) c.setSeed(Math.max(1, +$('harmSeed').value | 0)); });
  $('harmDice').addEventListener('click', () => { const c = conductor(); if (!c) return; const s = 1 + Math.floor(Math.random() * 99999); $('harmSeed').value = s; c.setSeed(s); });
  $('playBtn').addEventListener('click', () => {
    const c = conductor(); if (!c) return;
    if (c.running) c.stop(); else { part().resume(); c.start(); }
    setPlayBtn(c.running);
  });
  document.querySelectorAll('#playerMode button').forEach(b => b.addEventListener('click', () => {
    const pl = currentPlayer(); if (!pl || !PLAYER_MODES.includes(b.dataset.pm)) return;
    pl.setMode(b.dataset.pm); buildPlayerUI();
  }));
  document.addEventListener('part-changed', buildPlayerUI);
  document.addEventListener('preset-loaded', () => { if (getScene()) buildPlayerUI(); });
  document.addEventListener('scene-changed', e => {
    clearInterval(infoTimer); infoTimer = null;
    if (e.detail.on) { syncHarmonyUI(); buildPlayerUI(); infoTimer = setInterval(refreshInfo, 200); }
  });
}
