/* =====================================================================
   SubSDJ · UI de la escena generativa: módulos «Armonía» (raíz, escala,
   progresión, modo lista/funciones, semilla, ▶ Tocar), «Jugador» (el de la
   parte que edita el rack: modo + sus knobs + su arreglo: Entra / Deriva)
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
const LS_ESCENA = 'subsdj.escena.v1';
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
const ARR_KNOBS = [['energia', 'Energía', 0, 1], ['vaiven', 'Vaivén', 0, 1], ['ciclo', 'Ciclo', 4, 64, 1],
                   ['apertura', 'Apertura', 0, 1], ['sorpresa', 'Sorpresa', 0, 1]];
let infoTimer = null, saveTimer = null;

const knobEl = lab => { const ctl = document.createElement('div'); ctl.className = 'ctl';
  ctl.innerHTML = `<div class="knob"><div class="ind"></div></div><div class="lab">${lab}</div><div class="val"></div>`; return ctl; };
function knobRow(host, specs, cfg, onSet) {
  host.innerHTML = '';
  for (const [key, lab, min, max, isInt] of specs) {
    const ctl = knobEl(lab); host.appendChild(ctl);
    attachKnob(ctl.querySelector('.knob'), { min, max, def: cfg[key], fmt: isInt ? int : undefined },
               v => { cfg[key] = isInt ? Math.round(v) : v; if (onSet) onSet(key, cfg[key]); });
  }
}
function currentPlayer() { const sc = getScene(); return sc ? sc.conductor.players[sc.sel] : null; }

function buildPlayerUI() {
  const sc = getScene(), pl = currentPlayer(); if (!pl) return;
  const p = sc.parts[sc.sel];
  $('playerWho').textContent = 'Parte ' + (sc.sel + 1) + (p.presetName ? ' · ' + p.presetName : '');
  document.querySelectorAll('#playerMode button').forEach(b => b.classList.toggle('active', b.dataset.pm === pl.cfg.mode));
  knobRow($('playerKnobs'), KNOBS[pl.cfg.mode] || [], pl.cfg);
  // arreglo de la parte: Entra (umbral) · Deriva (parámetro) · Cantidad
  const host = $('playerArr'); host.innerHTML = '';
  const kU = knobEl('Entra'); host.appendChild(kU);
  attachKnob(kU.querySelector('.knob'), { min: 0, max: 1, def: pl.cfg.umbral }, v => { pl.cfg.umbral = v; });
  const selWrap = document.createElement('div'); selWrap.className = 'ctl'; selWrap.style.width = 'auto';
  selWrap.innerHTML = `<select id="derivaSel" title="Parámetro del preset que pasea despacio"></select><div class="lab">Deriva</div>`;
  host.appendChild(selWrap);
  const sel = selWrap.querySelector('select');
  DERIVA_KEYS.forEach(k => sel.add(new Option(k === 'off' ? '—' : k, k)));
  sel.value = pl.cfg.deriva || 'off';
  sel.addEventListener('change', () => { pl.setDeriva(sel.value); if (sel.value !== 'off' && CONTROLS[sel.value]) CONTROLS[sel.value].set(pl.part.engine.S[sel.value]); });
  const kA = knobEl('Cantidad'); host.appendChild(kA);
  attachKnob(kA.querySelector('.knob'), { min: 0, max: 1, def: pl.cfg.derivaAmt, act: true }, v => { pl.cfg.derivaAmt = v; });
}

function syncHarmonyUI() {
  const c = conductor(); if (!c) return;
  const h = c.harmony;
  $('harmRoot').value = h.root; $('harmScale').value = h.scale;
  $('harmProg').value = h.prog.join(' '); $('harmBars').textContent = h.bars;
  document.querySelectorAll('#harmModo button').forEach(b => b.classList.toggle('active', b.dataset.m === h.modo));
  $('harmSeed').value = c.seed;
  setPlayBtn(c.running);
  knobRow($('arrKnobs'), ARR_KNOBS, c.arr.cfg);
}
function setPlayBtn(on) {
  const b = $('playBtn'); b.textContent = on ? '■ Parar' : '▶ Tocar'; b.classList.toggle('on', on);
  if (!on) { $('harmInfo').textContent = 'parado'; $('arrInfo').textContent = '—'; }
}
function refreshInfo() {
  const c = conductor(); if (!c || !c.running) return;
  const bar = c.barNow(), ch = c.harmony.chordAt(bar);
  $('harmInfo').textContent = 'compás ' + (bar + 1) + ' · ' + (GRADOS[ch.degree - 1] || ch.degree) + ' · ' + NOTAS[ch.rootPc];
  const E = c.arr.energyAt(bar), n = Math.max(1, c.arr.cfg.ciclo);
  $('arrInfo').textContent = 'ciclo ' + ((bar % n) + 1) + '/' + n + ' · energía ' + E.toFixed(2) +
    ' · tocan ' + c.players.map((p, i) => c.arr.stateAt(bar, i, p.cfg).active && p.cfg.mode !== 'off' ? (i + 1) : '·').join('');
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
  // escena
  $('sceneExp').addEventListener('click', () => {
    const sc = getScene(); if (!sc) return;
    const d = new Date(), p = x => String(x).padStart(2, '0');
    download(new Blob([JSON.stringify(sceneToJSON(sc), null, 1)], { type: 'application/json' }),
             `subsdj-escena-${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}-${p(d.getHours())}${p(d.getMinutes())}.json`);
  });
  $('sceneImp').addEventListener('click', () => $('sceneFile').click());
  $('sceneFile').addEventListener('change', async e => {
    const f = e.target.files[0]; e.target.value = ''; if (!f) return;
    try { await loadScene(JSON.parse(await f.text())); $('presetMsg').textContent = 'Escena cargada: ' + f.name; }
    catch (err) { $('presetMsg').textContent = 'Escena no válida: ' + (err.message || err); }
  });
  $('sceneLast').addEventListener('click', async () => {
    let j = null; try { j = JSON.parse(localStorage.getItem(LS_ESCENA)); } catch (e) {}
    if (!j) { $('presetMsg').textContent = 'No hay escena guardada'; return; }
    try { await loadScene(j); $('presetMsg').textContent = 'Última escena recuperada (' + (j.fecha || '').slice(0, 16) + ')'; }
    catch (err) { $('presetMsg').textContent = 'Escena no válida: ' + (err.message || err); }
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
