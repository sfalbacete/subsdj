/* =====================================================================
   SubSDJ · UI de Partes: botón «Partes» y selector 1-4 en la cabecera +
   módulo «Mezclador». Encender la escena crea 4 motores sobre el mismo
   contexto con una Sala compartida (engine/parts.js); el rack pasa a
   editar la parte elegida (syncControls vuelca su estado sin cortarle las
   notas). El mezclador enseña las 4 partes: Nivel (= el Master del preset
   de la parte), Pan, envíos Delay/Reverb (= Amount del delay y Mix de la
   reverb del preset), M (silenciar); y la columna Sala: máster de la
   escena, realimentación del eco y eco→reverb. Capa: el teclado toca todas.
   Los módulos Delay, Reverb y Cinta llevan la etiqueta «sala» en escena:
   salvo Amount/Mix (envíos), sus knobs son de la sala compartida.
   ===================================================================== */
import { part, sceneOn, getScene, enableScene, disableScene, selectPart, setPartMute, setPartPan, setLayer } from '../engine/parts.js';
import { CONTROLS, syncControls } from './registry.js';
import { attachKnob } from './knobs.js';
import { panic } from './keyboard.js';

const SALA_PANELS = ['Delay', 'Reverb', 'Cinta'];
const SEND_KEYS = new Set(['master', 'dlyAmt', 'reverbMix']);
const $ = id => document.getElementById(id);
let strips = [], silent = false, salaPanels = [];

// Se resuelven UNA vez al arrancar (antes de colgar etiquetas del h2: luego su
// texto ya no casaría con el título).
const panelByTitle = t => [...document.querySelectorAll('.panel h2')]
  .find(h => h.textContent.replace(/[\s?]/g, '') === t)?.closest('.panel');

const knobHtml = lab => `<div class="ctl"><div class="knob"><div class="ind"></div></div><div class="lab">${lab}</div><div class="val"></div></div>`;
const panFmt = v => v < -0.02 ? 'L' + Math.round(-v * 100) : v > 0.02 ? 'R' + Math.round(v * 100) : 'C';

function buildStrips() {
  const host = $('mixStrips'), sc = getScene();
  host.innerHTML = ''; strips = []; silent = true;   // los knobs disparan onChange al nacer: no reescribir el motor
  sc.parts.forEach((p, i) => {
    const div = document.createElement('div');
    div.className = 'strip'; div.dataset.i = i;
    div.innerHTML = `<button class="pname" title="Editar esta parte en el rack"></button>` +
      `<div class="row tight">${knobHtml('Nivel')}${knobHtml('Pan')}${knobHtml('Delay')}${knobHtml('Reverb')}</div>` +
      `<button class="mute" title="Silenciar la parte">M</button>`;
    host.appendChild(div);
    const [kLevel, kPan, kDly, kRev] = div.querySelectorAll('.knob');
    const S = p.engine.S;
    // Nivel / envíos SON parámetros del preset de la parte: se escriben en su
    // motor y, si es la parte que edita el rack, también en su knob del rack.
    const bindSend = (el, key, cfg) => attachKnob(el, { ...cfg, def: S[key] }, v => {
      if (silent) return;
      p.engine.set(key, v);
      document.dispatchEvent(new Event('deps-refresh'));   // un envío de otra parte enciende o apaga la sala (ui/deps.js)
      if (p.engine === part() && CONTROLS[key] && CONTROLS[key].get() !== v) CONTROLS[key].set(v);
    });
    const st = {
      div,
      level: bindSend(kLevel, 'master', { min: 0, max: 1 }),
      dly:   bindSend(kDly, 'dlyAmt', { min: 0, max: 0.9, act: true }),
      rev:   bindSend(kRev, 'reverbMix', { min: 0, max: 0.6, act: true }),
      pan:   attachKnob(kPan, { min: -1, max: 1, def: p.pan, fmt: panFmt }, v => { if (!silent) setPartPan(i, v); }),
    };
    strips.push(st);
    div.querySelector('.pname').addEventListener('click', () => choose(i));
    div.querySelector('.mute').classList.toggle('on', p.mute); div.classList.toggle('muted', p.mute);
    div.querySelector('.mute').addEventListener('click', e => {
      setPartMute(i, !p.mute);
      e.currentTarget.classList.toggle('on', p.mute); div.classList.toggle('muted', p.mute);
    });
  });
  // Columna Sala: máster de la escena, realimentación del eco, eco → reverb
  const sala = document.createElement('div');
  sala.className = 'strip sala';
  sala.innerHTML = `<div class="pname static">Sala</div>` +
    `<div class="row tight">${knobHtml('Máster')}${knobHtml('Realim.')}${knobHtml('Eco→Rev')}</div>` +
    `<label class="chk"><input type="checkbox" id="layerChk"> Capa: el teclado toca todas</label>`;
  host.appendChild(sala);
  const [kM, kFb, kToRev] = sala.querySelectorAll('.knob');
  attachKnob(kM, { min: 0, max: 1, def: sc.salaCfg.master }, v => { sc.salaCfg.master = v; sc.sala.setMaster(v); });
  attachKnob(kFb, { min: 0, max: 0.85, def: sc.salaCfg.fb, act: true }, v => { sc.salaCfg.fb = v; sc.sala.setFeedback(v); });
  attachKnob(kToRev, { min: 0, max: 1, def: sc.salaCfg.dlyToRev, act: true }, v => { sc.salaCfg.dlyToRev = v; sc.sala.setDlyToRev(v); });
  $('layerChk').addEventListener('change', e => setLayer(e.target.checked));
  silent = false;
  refreshNames();
}

function refreshNames() {
  const sc = getScene(); if (!sc) return;
  sc.parts.forEach((p, i) => {
    strips[i].div.querySelector('.pname').textContent = (i + 1) + ' · ' + (p.presetName || 'Init');
    strips[i].div.classList.toggle('cur', i === sc.sel);
  });
  document.querySelectorAll('#partSel button').forEach(b => b.classList.toggle('active', +b.dataset.p === sc.sel));
}

// La tira de la parte que edita el rack refleja sus knobs Master / Amount / Mix
function refreshCurrent() {
  const sc = getScene(); if (!sc) return;
  const st = strips[sc.sel]; if (!st) return;   // en plena reconstrucción de tiras aún no existe
  const S = part().S;
  silent = true;
  try { st.level.set(S.master); st.dly.set(S.dlyAmt); st.rev.set(S.reverbMix); }
  finally { silent = false; }
}

function choose(i) {
  const sc = getScene(); if (!sc || i === sc.sel) return;
  selectPart(i);
  syncControls(part().S);                     // el rack enseña la parte (sin cortarle las notas)
  const sel = $('presetSelect'), p = sc.parts[i];
  if (sel && p.presetVal) sel.value = p.presetVal;
  if (sel && sel.selectedIndex < 0 && p.presetName) {   // escenas de antes de la biblioteca ('f:Nombre'): por nombre
    const o = [...sel.options].find(o => o.textContent === p.presetName); if (o) sel.value = o.value;
  }
  const msg = $('presetMsg'); if (msg) msg.textContent = 'Parte ' + (i + 1) + (p.presetName ? ' · ' + p.presetName : '');
  refreshNames();
  document.dispatchEvent(new CustomEvent('part-changed', { detail: { i } }));   // el módulo Jugador sigue a la parte
}

// Con las Partes apagadas, sus módulos siguen EN SU SITIO, atenuados (panel
// fijo: nada aparece ni desaparece moviendo a los demás); el mezclador vacío
// explica cómo encenderlas (CSS).
function setUI(on) {
  $('partsBtn').classList.toggle('on', on);
  $('partSel').hidden = !on;
  for (const id of ['mixer', 'harmony', 'player', 'arrange']) $(id).classList.toggle('parts-off', !on);
  if (!on) { $('mixStrips').innerHTML = ''; strips = []; }
  document.body.classList.toggle('parts', on);
  document.dispatchEvent(new CustomEvent('scene-changed', { detail: { on } }));
  for (const panel of salaPanels) {
    const h2 = panel.querySelector('h2');
    let tag = h2.querySelector('.tag-sala');
    if (on && !tag) { tag = document.createElement('span'); tag.className = 'tag-sala'; tag.textContent = 'sala'; tag.title = 'Compartido por todas las partes (salvo el envío)'; h2.appendChild(tag); }
    if (!on && tag) tag.remove();
  }
}

async function toggle(btn) {
  if (sceneOn()) {
    disableScene(); setUI(false); syncControls(part().S);
    const msg = $('presetMsg'); if (msg) msg.textContent = 'Partes apagadas: motor único';
    return;
  }
  if (!part().ready) return;
  btn.disabled = true;
  try { await enableScene(); } finally { btn.disabled = false; }
  buildStrips(); setUI(true); syncControls(part().S);
  const sel = $('presetSelect'), p0 = getScene().parts[0];      // la parte 1 hereda el sonido (y su nombre de preset)
  if (sel && sel.selectedOptions[0]) { p0.presetVal = sel.value; p0.presetName = sel.selectedOptions[0].textContent; refreshNames(); }
  const msg = $('presetMsg'); if (msg) msg.textContent = 'Partes: la 1 hereda el sonido que había';
}

export function initPartsControls() {
  const btn = $('partsBtn'); if (!btn) return;
  salaPanels = SALA_PANELS.map(panelByTitle).filter(Boolean);
  btn.addEventListener('click', () => toggle(btn));
  // Pánico: el director para y cancela lo pendiente, y todas las partes sueltan todo
  const pb = $('panicBtn');
  if (pb) pb.addEventListener('click', () => { const sc = getScene(); if (sc) sc.conductor.panic(); panic(); document.dispatchEvent(new CustomEvent('scene-changed', { detail: { on: sceneOn() } })); });
  document.querySelectorAll('#partSel button').forEach(b => b.addEventListener('click', () => { part().resume(); choose(+b.dataset.p); }));
  document.addEventListener('param-change', e => { if (sceneOn() && SEND_KEYS.has(e.detail.target)) refreshCurrent(); });
  // escena cargada desde JSON (playerControls): tiras, rack y módulos de la escena al día
  document.addEventListener('scene-loaded', () => { if (!sceneOn()) return; buildStrips(); setUI(true); syncControls(part().S); });
  document.addEventListener('preset-loaded', e => {
    const sc = getScene(); if (!sc) return;
    const p = sc.parts[sc.sel]; p.presetVal = e.detail.value; p.presetName = e.detail.name;
    refreshNames();
  });
}
