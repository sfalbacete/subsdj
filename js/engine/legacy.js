/* =====================================================================
   SubSDJ · what was saved up to 1.3.0, Spanish → English (1.4.0).
   Presets, scenes, libraries and MIDI maps stored keys and
   values in Spanish ('placa', 'tocar', vocVida…), and the factory had
   Spanish names. From 1.4.0 on, everything that is written is in
   English; older data is translated ON LOAD, with these tables, and sounds
   exactly the same (check «1.3.0 compatibility»). Libraries
   store COPIES, so the translation is forever.
   ===================================================================== */

// Renamed parameter keys (also in MIDI maps: midimap.RENAMED)
export const PARAM_KEYS = { vocVida: 'vocLife', vocBrillo: 'vocBright', resBrillo: 'resBright' };

// Scales (Harmony.ESCALAS; used by the scenes and by the Seq in degrees)
export const SCALES = {
  'mayor': 'major', 'menor': 'minor', 'menor armónica': 'harmonic minor', 'dórica': 'dorian',
  'frigia': 'phrygian', 'lidia': 'lydian', 'mixolidia': 'mixolydian', 'penta mayor': 'major penta',
  'penta menor': 'minor penta', 'tonos enteros': 'whole tone',
};
// Bars ('1 c' = one bar): tempo divisions of LFOs and Steps, drift and reset of the Steps
const BARS = { '1 c': '1 bar', '2 c': '2 bars', '4 c': '4 bars', '8 c': '8 bars', '16 c': '16 bars' };
const SYNC = { libre: 'free', ...BARS };

// Values of the text parameters, by key
export const VALUES = {
  waveA: { tabla: 'wavetable', cuerda: 'string' },
  waveB: { tabla: 'wavetable', cuerda: 'string' },
  wtSet: { 'analógica': 'analog', 'órgano': 'organ', formante: 'formant', 'metálica': 'metallic', glotal: 'glottal', usuario: 'user' },
  driveChar: { suave: 'soft', plegado: 'fold' },
  envmMode: { bucle: 'loop', disparo: 'trigger' },
  reverbType: { sala: 'hall', placa: 'plate' },
  lfoPhase: { voz: 'voice', reinicio: 'retrig', una: 'once' },
  seqNotes: { semitonos: 'semitones', 'armonía': 'harmony', ...SCALES },
  stReset: { tocar: 'play', nunca: 'never', ...BARS },
  dlySync: SYNC, pwmLfoSync: SYNC, cutLfoSync: SYNC, resLfoSync: SYNC, ampLfoSync: SYNC, freqLfoSync: SYNC, panLfoSync: SYNC,
  st1Div: BARS, st2Div: BARS, st3Div: BARS, st4Div: BARS,
  st1Drift: BARS, st2Drift: BARS, st3Drift: BARS, st4Drift: BARS,
};

// A preset (PARAMS keys) from before → today's. With nothing to translate, the same object.
export function migratePreset(p) {
  if (!p || typeof p !== 'object') return p;
  let q = null;
  for (const k in p) {
    const k2 = PARAM_KEYS[k], v = p[k], v2 = VALUES[k2 || k] && typeof v === 'string' ? VALUES[k2 || k][v] : undefined;
    if (k2 || v2 !== undefined) { q = q || { ...p }; if (k2) delete q[k]; q[k2 || k] = v2 !== undefined ? v2 : v; }
  }
  return q || p;
}

// ---------- names (glossary: docs/GLOSARIO.md) ----------
// Factory categories and fixed library sections
export const SECTION_NAMES = {
  'Básicos': 'Basics', 'Bajos': 'Bass', 'Escalonados': 'Stepped', 'Voz': 'Voice', 'Plucks & Teclas': 'Plucks & Keys',
  'Cuerdas': 'Plucked Strings', 'Órgano': 'Organ', 'Percusión': 'Percussion', 'FX & Atmósferas': 'FX & Atmospheres',
  '★ Míos': '★ Mine', 'Escenas': 'Scenes', 'Importados': 'Imported', 'Demos A/B': 'A/B Demos',
};
// Factory presets, «Presets 2.0» presets and repo scenes
export const PRESET_NAMES = {
  // Bass
  'Bajo RC (curva)': 'RC Bass (curve)', 'Sub redondo': 'Round Sub', 'Bajo grueso': 'Fat Bass', 'Bajo pluck': 'Pluck Bass',
  'Ácido 303': 'Acid 303', 'Slide bass': 'Slide Bass', 'Wobble dub': 'Dub Wobble', 'Bajo cremoso (24 dB)': 'Creamy Bass (24 dB)',
  'Bajo camaleón (nota→PW)': 'Chameleon Bass (note→PW)',
  // Leads
  'Lead S&H (filtro random)': 'S&H Lead (random filter)', 'Lead brillante': 'Bright Lead', 'Lead cuadrado': 'Square Lead',
  'Supersaw lead': 'Supersaw Lead', 'Supersaw trance': 'Trance Supersaw', 'Lead mono glide': 'Mono Glide Lead', 'PWM lead': 'PWM Lead',
  'Flauta vibrato': 'Vibrato Flute', 'Wah al vibrato': 'Vibrato Wah',
  // Pads
  'Pad que respira (deriva)': 'Breathing Pad (drift)', 'Pad phaser (notch)': 'Phaser Pad (notch)', 'Pad de placa': 'Plate Pad',
  'Pad cálido': 'Warm Pad', 'PWM strings': 'PWM Strings', 'Supersaw pad': 'Supersaw Pad', 'Pad de cristal': 'Glass Pad',
  'Pad evolutivo': 'Evolving Pad', 'Coro (choir)': 'Choir', 'Strings ensemble': 'String Ensemble', 'Solina strings': 'Solina Strings',
  'Ensemble PWM': 'PWM Ensemble', 'Pad mantequilla': 'Butter Pad', 'Pad catedral': 'Cathedral Pad', 'Pad PWM unison': 'PWM Unison Pad',
  'Pad aire': 'Air Pad', 'Pad matricial': 'Matrix Pad', 'Coro de vocales (tabla)': 'Vowel Choir (wavetable)',
  'Textura Wavestation (ws)': 'Wavestation Texture (ws)', 'Deriva orgánica': 'Organic Drift',
  // Cinescape
  'Pad glaciar (ataque 12 s)': 'Glacial Pad (12 s attack)', 'Drone de sótano (−2 octavas)': 'Basement Drone (−2 octaves)',
  'Pad de cuatro vientos (deriva por voz)': 'Four Winds Pad (per-voice drift)', 'Pad shimmer (coro que sube)': 'Shimmer Pad (rising choir)',
  'Pad de ejecución (rueda, aftertouch, pedal)': 'Performance Pad (wheel, aftertouch, pedal)', 'Pad de cinta (nostalgia)': 'Tape Pad (nostalgia)',
  'Cuenco tibetano (ruido + resonador)': 'Singing Bowl (noise + resonator)', 'Metal frotado (sierra + resonador)': 'Bowed Metal (saw + resonator)',
  // Stepped
  'Un S&H, tres destinos': 'One S&H, Three Targets', 'Tabla, filtro y puerta (16 · 8 · tresillo)': 'Table, Filter and Gate (16 · 8 · triplet)',
  'Escalera de ocho (3 LFO cuadrados)': 'Eight-Step Stairs (3 square LFOs)', 'Melodía de LFO (tonos enteros)': 'LFO Melody (whole tone)',
  'Acorde que habla (S&H por voz)': 'Talking Chord (per-voice S&H)', 'Tres ciclos que tardan 30 s (5 · 6 · 8 · 16)': 'Three Cycles, 30 s Around (5 · 6 · 8 · 16)',
  // Voice
  'Coro humano': 'Human Choir', 'Robot parlante': 'Talking Robot', 'Madrigal (vocal por nota)': 'Madrigal (vowel per note)',
  'Voz glotal (esfuerzo)': 'Glottal Voice (effort)', 'Percusión vocal (ka)': 'Vocal Percussion (ka)',
  // Plucks & Keys
  'Campana (Ring)': 'Bell (Ring)', 'Caja de música': 'Music Box', 'Piano eléctrico': 'Electric Piano', 'Pluck supersaw': 'Supersaw Pluck',
  'Teclas al tacto (vel→filtro)': 'Touch Keys (vel→filter)', 'Campanas de tabla (S&H)': 'Wavetable Bells (S&H)',
  'Ataque digital (1shot)': 'Digital Attack (1shot)', 'Pluck lotería (S&H)': 'Lottery Pluck (S&H)',
  // Plucked Strings
  'Guitarra de nailon': 'Nylon Guitar', 'Guitarra de doce cuerdas': 'Twelve-String Guitar', 'Arpa': 'Harp',
  'Bajo pulsado': 'Plucked Bass', 'Piano de cuerda': 'String Piano', 'Campana de cuerda': 'String Bell',
  // FM
  'Piano FM (Rhodes)': 'FM Piano (Rhodes)', 'DX e-piano': 'DX E-Piano', 'FM brass': 'FM Brass', 'Clav FM': 'FM Clav', 'Bajo FM': 'FM Bass',
  'DX bass': 'DX Bass', 'Marimba FM': 'FM Marimba', 'Glockenspiel FM': 'FM Glockenspiel', 'Campana FM': 'FM Bell',
  'Campana tubular': 'Tubular Bell', 'Gong metálico': 'Metallic Gong', 'Pad FM vidrio': 'FM Glass Pad', 'Sci-fi FM': 'Sci-Fi FM',
  'Campana DX (env→FM)': 'DX Bell (env→FM)', 'E-piano DX (vel→FM)': 'DX E-Piano (vel→FM)', 'Brass FM (feedback)': 'FM Brass (feedback)',
  // FM4
  'FM4 · Brass pila': 'FM4 · Stacked Brass', 'FM4 · E-piano pares': 'FM4 · Paired E-Piano', 'FM4 · Campana densa': 'FM4 · Dense Bell',
  'FM4 · Bombo': 'FM4 · Kick',
  // Organ
  'Órgano trémolo': 'Tremolo Organ', 'Órgano pleno': 'Full Organ', 'Órgano de iglesia': 'Church Organ', 'Órgano de tabla': 'Wavetable Organ',
  // Percussion
  'Bombo 808': '808 Kick', 'Bombo 909': '909 Kick', 'Tom sintético': 'Synth Tom', 'Caja zap': 'Zap Snare', 'Caja 808': '808 Snare',
  'Palmada 808': '808 Clap', 'Rimshot 909': '909 Rimshot', 'Cencerro 808': '808 Cowbell', 'Hat abierto': 'Open Hat',
  'Hat FM (feedback)': 'FM Hat (feedback)', 'Crash 909': '909 Crash', 'Ride 909': '909 Ride', 'Hit rave': 'Rave Hit', 'Láser zap': 'Laser Zap',
  // Stabs
  'Hoover rave': 'Rave Hoover', 'Supersaw stab': 'Supersaw Stab', 'Stab metálico': 'Metallic Stab',
  // FX & Atmospheres
  'Bleeps S&H (pitch random)': 'S&H Bleeps (random pitch)', 'Drone sci-fi': 'Sci-Fi Drone', 'Riser tensión': 'Tension Riser',
  'Nave espacial': 'Spaceship', 'Blip resonante': 'Resonant Blip', 'Wobble sincopado': 'Syncopated Wobble', 'Dub de cinta': 'Tape Dub',
  // Presets 2.0
  'Arp · Acid squelch': 'Arp · Acid Squelch', 'Arp · Trance uplift': 'Arp · Trance Uplift', 'Arp · Cristales al alba': 'Arp · Crystals at Dawn',
  'Arp · Bajo motorik': 'Arp · Motorik Bass', 'Arp · Cajita mágica': 'Arp · Magic Box', 'Arp · Pulso oscuro': 'Arp · Dark Pulse',
  'Cine · Amanecer': 'Cine · Dawn', 'Cine · Abismo': 'Cine · Abyss', 'Cine · Coro espectral': 'Cine · Spectral Choir',
  'Cine · Interestelar': 'Cine · Interstellar', 'Cine · Batisfera': 'Cine · Bathysphere',
  'Duro · Hoover 2.0': 'Hard · Hoover 2.0', 'Duro · Growl FM': 'Hard · FM Growl', 'Duro · Neuro wobble': 'Hard · Neuro Wobble',
  'Duro · Bombo gabber': 'Hard · Gabber Kick', 'Duro · Sierra industrial': 'Hard · Industrial Saw', 'Duro · Órgano rave': 'Hard · Rave Organ',
  'Ritmo · Trance gate': 'Rhythm · Trance Gate', 'Ritmo · Sidechain pump': 'Rhythm · Sidechain Pump', 'Ritmo · Helicóptero': 'Rhythm · Helicopter',
  'Ritmo · Eco dub': 'Rhythm · Dub Echo', 'Ritmo · Vaivén': 'Rhythm · Sway', 'Ritmo · Cuerdas trémolo': 'Rhythm · Tremolo Strings',
  'Tecla · Clavinet funky': 'Keys · Funky Clavinet', 'Tecla · EP soñador': 'Keys · Dreamy EP', 'Tecla · Órgano Leslie': 'Keys · Leslie Organ',
  'Tecla · Clavecín': 'Keys · Harpsichord', 'Tecla · Vibráfono': 'Keys · Vibraphone', 'Tecla · Acordeón': 'Keys · Accordion',
  'Textura · Hi-hat': 'Texture · Hi-Hat', 'Textura · Caja 909': 'Texture · 909 Snare', 'Textura · Olas': 'Texture · Waves',
  'Textura · Viento polar': 'Texture · Polar Wind', 'Textura · Radio vieja': 'Texture · Old Radio', 'Textura · Motor diésel': 'Texture · Diesel Engine',
  // repo scenes
  'Amanecer dórico': 'Dorian Dawn', 'Ambient nocturno (demo)': 'Night Ambient (demo)', 'Coro robótico': 'Robot Choir', 'Techno hipnótico': 'Hypnotic Techno',
};
// 'Cine · Tundra', 'Koto', 'Pluck', 'Reese', 'FM4 · Hat'… were already in English (or are proper names)
export const presetName = n => PRESET_NAMES[n] || n;

// ---------- scenes: subsdj-escena-v1 → subsdj-scene-v2 ----------
export const SCENE_FORMAT = 'subsdj-scene-v2';
const PLAYER_KEYS = { acento: 'accent', respira: 'breathe', cicloP: 'breatheCycle', notas: 'notes', densidad: 'density', silencio: 'rest',
  gravedad: 'gravity', rango: 'range', quinta: 'fifth', cada: 'every', umbral: 'threshold', deriva: 'drift', derivaAmt: 'driftAmt' };
export const PLAYER_MODES_ES = { pulso: 'pulse', acorde: 'chord', melodia: 'melody', raiz: 'root' };
const ARR_KEYS = { energia: 'energy', vaiven: 'sway', ciclo: 'cycle', apertura: 'open', sorpresa: 'surprise' };
const HARMONY_MODES = { lista: 'list', funciones: 'functions' };
const renameKeys = (o, map) => { const q = {}; for (const k in o) q[map[k] || k] = o[k]; return q; };
const defined = o => { for (const k in o) if (o[k] === undefined) delete o[k]; return o; };

export function migrateScene(j) {
  if (!j || j.formato !== 'subsdj-escena-v1') return j;
  const d = j.director || {}, a = d.armonia;
  return defined({
    format: SCENE_FORMAT, name: j.nombre !== undefined ? presetName(j.nombre) : undefined, note: j.nota, date: j.fecha,
    room: j.sala ? migratePreset(j.sala) : undefined,   // bpm, dlySync ('libre')…: parameter keys
    conductor: j.director ? defined({
      seed: d.seed,
      harmony: a ? defined({ root: a.root, scale: SCALES[a.scale] || a.scale, prog: a.prog, bars: a.bars, mode: HARMONY_MODES[a.modo] || a.modo }) : undefined,
      arrangement: d.arreglo ? renameKeys(d.arreglo, ARR_KEYS) : undefined,
      players: (d.jugadores || []).map(c => {
        const q = renameKeys(c, PLAYER_KEYS);
        q.mode = PLAYER_MODES_ES[q.mode] || q.mode;
        if (q.drift) q.drift = PARAM_KEYS[q.drift] || q.drift;
        return q;
      }),
    }) : undefined,
    parts: (j.partes || []).map(p => defined({
      name: p.nombre !== undefined ? presetName(p.nombre) : undefined,
      preset: p.preset !== undefined ? presetName(p.preset) : undefined,
      settings: p.ajustes ? migratePreset(p.ajustes) : undefined,
      presetVal: typeof p.presetVal === 'string' && p.presetVal.startsWith('f:') ? 'f:' + presetName(p.presetVal.slice(2)) : p.presetVal,
      pan: p.pan, mute: p.mute,
      state: p.estado ? migratePreset(p.estado) : undefined,
    })),
  });
}

// ---------- library: subsdj-biblioteca-v1 → subsdj-library-v2 ----------
export const LIBRARY_FORMAT = 'subsdj-library-v2';
const ORIGINS = { usuario: 'user', fabrica: 'factory', escena: 'scene' };   // 'v2', 'demos', 'import': unchanged
// An item from before: keys in English and data translated; if it comes from the factory, the
// bank or the repo scenes and was not renamed (its name is its seed's),
// the name is translated and the seed along with it (so «Restore factory» does not duplicate it).
function migrateItem(it) {
  const type = it.tipo === 'escena' ? 'scene' : 'preset', origin = ORIGINS[it.origen] || it.origen;
  let name = it.nombre, seed = it.semilla || null;
  if (seed) {
    const sName = seed.slice(seed.indexOf(':') + 1);
    if (name === sName) name = presetName(name);
    seed = origin + ':' + presetName(sName);
  }
  const data = type === 'scene' ? migrateScene(it.datos || {}) : migratePreset(it.datos || {});
  return { id: it.id, type, name, section: it.seccion, fav: !!it.fav, origin, seed, data };
}
// A whole library (the saved one or an exported file). The A/B demos leave the
// main bank in 1.4.0: their seeded items go, and so does their section if it is left empty.
export function migrateLibrary(d, { dropDemos = true } = {}) {
  if (!d || d.formato !== 'subsdj-biblioteca-v1') return d;
  let items = (d.items || []).filter(it => it && typeof it === 'object').map(migrateItem);
  if (dropDemos) items = items.filter(it => it.origin !== 'demos');
  const used = new Set(items.map(it => it.section));
  const sections = (d.secciones || [])
    .filter(s => !(dropDemos && s.nombre === 'Demos A/B' && !used.has(s.id)))
    .map(s => ({ id: s.id, name: SECTION_NAMES[s.nombre] || s.nombre }));
  return defined({ format: LIBRARY_FORMAT, next: d.next, files: d.ficheros, date: d.fecha, sections, items });
}
