/* =====================================================================
   SubSDJ · UI de la escena generativa: módulos «Armonía» (raíz, escala,
   progresión, modo lista/funciones, semilla, ▶ Tocar), «Jugador» (el de la
   parte que edita el rack: modo + sus knobs; su arreglo,
   Entra / Deriva, es una fila del módulo Arreglo)
   y «Arreglo» (energía, vaivén, ciclo, apertura, sorpresa + la ESCENA:
   ⇩ exportar, ⇧ importar, ↺ última — se autoguarda cada pocos segundos).
   Solo visibles con la escena encendida (partsControls los muestra/oculta).
   Los ajustes viven en el director de la escena (engine/Conductor.js), no
   en los presets: el preset es el instrumento, el jugador es el músico.
   ===================================================================== */
import { part, getScene, sceneOn, sceneToJSON, applySceneJSON, enableScene } from '../engine/parts.js';
import { ESCALAS, NOTAS, GRADOS, parseProg } from '../engine/Harmony.js';
import { PLAYER_MODES, DERIVA_KEYS } from '../engine/Player.js';
import { attachKnob } from './knobs.js';
import { CONTROLS } from './registry.js';
import { download } from './recorder.js';

const $ = id => document.getElementById(id);
const LS_ESCENA = 'subsdj.scene.v2', LS_ESCENA_V1 = 'subsdj.escena.v1';   // la de hasta la 1.3.0: ↺ Last la lee si no hay otra
const conductor = () => { const sc = getScene(); return sc ? sc.conductor : null; };
const int = v => String(Math.round(v));
// knobs por modo: [clave, etiqueta, min, max, entero?]
const KNOBS = {
  pulse:   [['k', 'Hits', 1, 16, 1], ['n', 'Steps', 4, 32, 1], ['rot', 'Rot', 0, 31, 1], ['prob', 'Prob', 0, 1],
            ['gate', 'Gate', 0.05, 1], ['accent', 'Accent', 0, 1], ['oct', 'Oct', 1, 7, 1], ['vel', 'Vel', 0.1, 1],
            ['breathe', 'Breathe', 0, 8, 1], ['breatheCycle', 'Cycle', 2, 16, 1]],   // el pulso que respira (Roadmap 7.0 · 5.4)
  chord:  [['notes', 'Notes', 3, 4, 1], ['oct', 'Oct', 1, 7, 1], ['vel', 'Vel', 0.1, 1]],
  melody: [['density', 'Density', 0, 1], ['rest', 'Rest', 0, 1], ['gravity', 'Gravity', 0, 1],
            ['range', 'Range', 1, 3, 1], ['legato', 'Legato', 0.1, 1], ['oct', 'Oct', 1, 7, 1], ['vel', 'Vel', 0.1, 1]],
  root:    [['fifth', 'Fifth', 0, 1, 1], ['every', 'Every', 1, 8, 1], ['oct', 'Oct', 1, 7, 1], ['vel', 'Vel', 0.1, 1]],
};
const ARR_KNOBS = [['energy', 'Energy', 0, 1], ['sway', 'Sway', 0, 1], ['cycle', 'Cycle', 4, 64, 1],
                   ['open', 'Open', 0, 1], ['surprise', 'Surprise', 0, 1]];
let infoTimer = null, saveTimer = null;
// los ajustes del director no pasan por el registro: avisan a ui/deps.js (qué está apagado) a mano
const depsRefresh = () => document.dispatchEvent(new Event('deps-refresh'));

const knobEl = lab => { const ctl = document.createElement('div'); ctl.className = 'ctl';
  ctl.innerHTML = `<div class="knob"><div class="ind"></div></div><div class="lab">${lab}</div><div class="val"></div>`; return ctl; };
// knob pequeño con la etiqueta delante (las filas compactas: el arreglo de la parte)
const ksEl = lab => { const ctl = document.createElement('div'); ctl.className = 'ctl ks'; ctl.dataset.lab = lab;
  ctl.innerHTML = `<span class="th">${lab}</span><div class="knob"><div class="ind"></div></div><div class="val"></div>`; return ctl; };
function knobRow(host, specs, cfg, onSet) {
  host.innerHTML = '';
  for (const [key, lab, min, max, isInt] of specs) {
    const ctl = knobEl(lab); ctl.dataset.key = key; host.appendChild(ctl);
    attachKnob(ctl.querySelector('.knob'), { min, max, def: cfg[key], fmt: isInt ? int : undefined },
               v => { cfg[key] = isInt ? Math.round(v) : v; if (onSet) onSet(key, cfg[key]); depsRefresh(); });
  }
}
function currentPlayer() { const sc = getScene(); return sc ? sc.conductor.players[sc.sel] : null; }

function buildPlayerUI() {
  const sc = getScene(), pl = currentPlayer(); if (!pl) return;
  const p = sc.parts[sc.sel];
  $('playerWho').textContent = 'Part ' + (sc.sel + 1) + (p.presetName ? ' · ' + p.presetName : '');
  document.querySelectorAll('#playerMode button').forEach(b => b.classList.toggle('active', b.dataset.pm === pl.cfg.mode));
  knobRow($('playerKnobs'), KNOBS[pl.cfg.mode] || [], pl.cfg);
  // arreglo de la parte (fila compacta del panel Arreglo): Entra (umbral) · Deriva (parámetro) · Cantidad
  $('arrPartWho').textContent = 'part ' + (sc.sel + 1);
  const host = $('playerArr'); host.innerHTML = '';
  const kU = ksEl('enters'); kU.dataset.key = 'threshold'; host.appendChild(kU);
  attachKnob(kU.querySelector('.knob'), { min: 0, max: 1, def: pl.cfg.threshold }, v => { pl.cfg.threshold = v; });
  const sel = document.createElement('select'); sel.id = 'derivaSel'; sel.title = 'Drift: a parameter of the part\'s preset that wanders slowly («—» = none)';
  host.appendChild(sel);
  DERIVA_KEYS.forEach(k => sel.add(new Option(k === 'off' ? '—' : k, k)));
  sel.value = pl.cfg.drift || 'off';
  sel.addEventListener('change', () => { pl.setDeriva(sel.value); depsRefresh(); if (sel.value !== 'off' && CONTROLS[sel.value]) CONTROLS[sel.value].set(pl.part.engine.S[sel.value]); });
  const kA = ksEl('amt'); kA.dataset.key = 'driftAmt'; kA.title = 'Amount of drift'; host.appendChild(kA);
  attachKnob(kA.querySelector('.knob'), { min: 0, max: 1, def: pl.cfg.driftAmt, act: true }, v => { pl.cfg.driftAmt = v; });
  depsRefresh();
}

function syncHarmonyUI() {
  const c = conductor(); if (!c) return;
  const h = c.harmony;
  $('harmRoot').value = h.root; $('harmScale').value = h.scale;
  $('harmProg').value = h.prog.join(' '); $('harmBars').textContent = h.bars;
  document.querySelectorAll('#harmModo button').forEach(b => b.classList.toggle('active', b.dataset.m === h.mode));
  $('harmSeed').value = c.seed;
  setPlayBtn(c.running);
  knobRow($('arrKnobs'), ARR_KNOBS, c.arr.cfg);
  depsRefresh();
}
function setPlayBtn(on) {
  const b = $('playBtn'); b.textContent = on ? '■ Stop' : '▶ Play'; b.classList.toggle('on', on);
  if (!on) { $('harmInfo').textContent = 'stopped'; $('arrInfo').textContent = '—'; }
}
export function isPlaying() { const c = conductor(); return !!(c && c.running); }
// ▶ Tocar y los ▶/⏹ de las escenas en la biblioteca pasan por aquí; avisa con play-changed
export function setPlaying(on) {
  const c = conductor(); if (!c) return false;
  if (on && !c.running) { part().resume(); c.start(); }
  else if (!on && c.running) c.stop();
  setPlayBtn(c.running);
  document.dispatchEvent(new CustomEvent('play-changed', { detail: { on: c.running } }));
  return c.running;
}
function refreshInfo() {
  const c = conductor(); if (!c || !c.running) return;
  const bar = c.barNow(), ch = c.harmony.chordAt(bar);
  $('harmInfo').textContent = 'bar ' + (bar + 1) + ' · ' + (GRADOS[ch.degree - 1] || ch.degree) + ' · ' + NOTAS[ch.rootPc];
  const E = c.arr.energyAt(bar), n = Math.max(1, c.arr.cfg.cycle);
  $('arrInfo').textContent = 'cycle ' + ((bar % n) + 1) + '/' + n + ' · energy ' + E.toFixed(2) +
    ' · playing ' + c.players.map((p, i) => c.arr.stateAt(bar, i, p.cfg).active && p.cfg.mode !== 'off' ? (i + 1) : '·').join('');
}

// ---------- escena: exportar / importar / última ----------
function saveLast() { const sc = getScene(); if (!sc) return; try { localStorage.setItem(LS_ESCENA, JSON.stringify(sceneToJSON(sc))); } catch (e) {} }
export async function loadScene(json) {   // también desde la biblioteca (pantalla Presets)
  if (!sceneOn()) { await enableScene(); document.dispatchEvent(new CustomEvent('scene-loaded')); }   // enciende (y la UI se monta)
  applySceneJSON(getScene(), json);
  document.dispatchEvent(new CustomEvent('scene-loaded'));   // partsControls: tiras + rack + scene-changed → aquí syncAll
}
function syncAll() { syncHarmonyUI(); buildPlayerUI(); }

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
    c.harmony.mode = b.dataset.m;
    document.querySelectorAll('#harmModo button').forEach(x => x.classList.toggle('active', x === b));
    depsRefresh();
  }));
  $('harmSeed').addEventListener('change', () => { const c = conductor(); if (c) c.setSeed(Math.max(1, +$('harmSeed').value | 0)); });
  $('harmDice').addEventListener('click', () => { const c = conductor(); if (!c) return; const s = 1 + Math.floor(Math.random() * 99999); $('harmSeed').value = s; c.setSeed(s); });
  $('playBtn').addEventListener('click', () => setPlaying(!isPlaying()));
  document.querySelectorAll('#playerMode button').forEach(b => b.addEventListener('click', () => {
    const pl = currentPlayer(); if (!pl || !PLAYER_MODES.includes(b.dataset.pm)) return;
    pl.setMode(b.dataset.pm); buildPlayerUI();
  }));
  // escena
  $('sceneExp').addEventListener('click', () => {
    const sc = getScene(); if (!sc) return;
    const d = new Date(), p = x => String(x).padStart(2, '0');
    download(new Blob([JSON.stringify(sceneToJSON(sc), null, 1)], { type: 'application/json' }),
             `subsdj-scene-${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}-${p(d.getHours())}${p(d.getMinutes())}.json`);
  });
  $('sceneImp').addEventListener('click', () => $('sceneFile').click());
  $('sceneFile').addEventListener('change', async e => {
    const f = e.target.files[0]; e.target.value = ''; if (!f) return;
    try { await loadScene(JSON.parse(await f.text())); $('presetMsg').textContent = 'Scene loaded: ' + f.name; }
    catch (err) { $('presetMsg').textContent = 'Invalid scene: ' + (err.message || err); }
  });
  $('sceneLast').addEventListener('click', async () => {
    let j = null; try { j = JSON.parse(localStorage.getItem(LS_ESCENA) || localStorage.getItem(LS_ESCENA_V1)); } catch (e) {}
    if (!j) { $('presetMsg').textContent = 'No saved scene'; return; }
    try { await loadScene(j); $('presetMsg').textContent = 'Last scene restored (' + (j.date || j.fecha || '').slice(0, 16) + ')'; }
    catch (err) { $('presetMsg').textContent = 'Invalid scene: ' + (err.message || err); }
  });
  window.addEventListener('beforeunload', saveLast);

  document.addEventListener('part-changed', buildPlayerUI);
  document.addEventListener('preset-loaded', () => { if (getScene()) buildPlayerUI(); });
  document.addEventListener('scene-changed', e => {
    clearInterval(infoTimer); infoTimer = null; clearInterval(saveTimer); saveTimer = null;
    if (e.detail.on) {
      const c = conductor();
      c.onDrift = (i, key, v) => { const sc = getScene(); if (sc && sc.sel === i && CONTROLS[key] && Math.abs(CONTROLS[key].get() - v) > 1e-9) CONTROLS[key].set(v); };
      syncAll();
      infoTimer = setInterval(refreshInfo, 200);
      saveTimer = setInterval(saveLast, 3000);
    } else saveLast();
  });
}
