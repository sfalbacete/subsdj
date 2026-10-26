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
export const SCALES_ES = {
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
  seqNotes: { semitonos: 'semitones', 'armonía': 'harmony', ...SCALES_ES },
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

// ---------- names (glossary: docs/GLOSSARY.md) ----------
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
      harmony: a ? defined({ root: a.root, scale: SCALES_ES[a.scale] || a.scale, prog: a.prog, bars: a.bars, mode: HARMONY_MODES[a.modo] || a.modo }) : undefined,
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

// ---------- the 1.4 bank: fingerprints of what it seeded ----------
// The 1.5.0 bank replaces the factory (docs/BANK.md). A library from before carries the
// old factory presets, the «Presets 2.0» bank and the four scenes as seeded items without a
// stored fingerprint (seedFp came with 1.5.0), so this table says what they looked like when
// they came in: seed key → [section, FNV-1a of the canonical data]. library.syncBank removes
// the copies that are still exactly that (and not ★); anything renamed, moved, edited or
// favorite stays. The whole old bank is archived in subsdj-bank-1.4.json.
export const LEGACY_FP = {
  "factory:Init (default)": ["Basics", '5465b825'],
  "factory:RC Bass (curve)": ["Bass", '7d3e3cd1'],
  "factory:Round Sub": ["Bass", '5abea1f0'],
  "factory:Fat Bass": ["Bass", '9d069d53'],
  "factory:Reese": ["Bass", 'caf7325b'],
  "factory:Pluck Bass": ["Bass", 'c2cb29dc'],
  "factory:Acid 303": ["Bass", '40363344'],
  "factory:Slide Bass": ["Bass", '20bcff85'],
  "factory:Dub Wobble": ["Bass", '4f1d48e4'],
  "factory:Creamy Bass (24 dB)": ["Bass", 'c77acdda'],
  "factory:Chameleon Bass (note→PW)": ["Bass", '83a951fe'],
  "factory:S&H Lead (random filter)": ["Leads", '4f5ef5b2'],
  "factory:Bright Lead": ["Leads", 'fcdd768d'],
  "factory:Square Lead": ["Leads", '6f65c108'],
  "factory:Supersaw Lead": ["Leads", '1f121475'],
  "factory:Trance Supersaw": ["Leads", '8fa98461'],
  "factory:Mono Glide Lead": ["Leads", '1a7b97aa'],
  "factory:PWM Lead": ["Leads", 'f62e3bc1'],
  "factory:Vibrato Flute": ["Leads", 'e57430d3'],
  "factory:Vibrato Wah": ["Leads", '015c2823'],
  "factory:Breathing Pad (drift)": ["Pads", '27ad051f'],
  "factory:Phaser Pad (notch)": ["Pads", '46090293'],
  "factory:Plate Pad": ["Pads", 'c8f98d63'],
  "factory:Warm Pad": ["Pads", 'a1eb7ebd'],
  "factory:PWM Strings": ["Pads", 'c63375f9'],
  "factory:Supersaw Pad": ["Pads", '25ef55e8'],
  "factory:Glass Pad": ["Pads", 'c27938e6'],
  "factory:Evolving Pad": ["Pads", 'c0e1a05a'],
  "factory:Choir": ["Pads", 'ccc71c4b'],
  "factory:String Ensemble": ["Pads", '27162e6c'],
  "factory:Solina Strings": ["Pads", '67ebd94c'],
  "factory:PWM Ensemble": ["Pads", 'e764770e'],
  "factory:Butter Pad": ["Pads", 'b3c5e7a7'],
  "factory:Cathedral Pad": ["Pads", 'a407b547'],
  "factory:PWM Unison Pad": ["Pads", '287c5ba7'],
  "factory:Air Pad": ["Pads", '9b9749c0'],
  "factory:Matrix Pad": ["Pads", '162ce5b3'],
  "factory:Vowel Choir (wavetable)": ["Pads", '7542899f'],
  "factory:Wavestation Texture (ws)": ["Pads", 'c1727d66'],
  "factory:Organic Drift": ["Pads", '50857b33'],
  "factory:Glacial Pad (12 s attack)": ["Cinescape", 'a565935c'],
  "factory:Basement Drone (−2 octaves)": ["Cinescape", '0da919ec'],
  "factory:Four Winds Pad (per-voice drift)": ["Cinescape", 'e992ddcb'],
  "factory:Shimmer Pad (rising choir)": ["Cinescape", '548d7b84'],
  "factory:Performance Pad (wheel, aftertouch, pedal)": ["Cinescape", 'db0c1e7b'],
  "factory:Tape Pad (nostalgia)": ["Cinescape", '3d6867fe'],
  "factory:Singing Bowl (noise + resonator)": ["Cinescape", 'edfdf890'],
  "factory:Bowed Metal (saw + resonator)": ["Cinescape", '6f05c1a1'],
  "factory:One S&H, Three Targets": ["Stepped", '17211cff'],
  "factory:Table, Filter and Gate (16 · 8 · triplet)": ["Stepped", '5d1eeb53'],
  "factory:Eight-Step Stairs (3 square LFOs)": ["Stepped", '794bc9a7'],
  "factory:LFO Melody (whole tone)": ["Stepped", '361c2eae'],
  "factory:Talking Chord (per-voice S&H)": ["Stepped", 'c1b75f6f'],
  "factory:Three Cycles, 30 s Around (5 · 6 · 8 · 16)": ["Stepped", '458f4e29'],
  "factory:Human Choir": ["Voice", 'a4012ae0'],
  "factory:Talking Robot": ["Voice", 'a0adadf7'],
  "factory:Madrigal (vowel per note)": ["Voice", '6ac894fd'],
  "factory:Glottal Voice (effort)": ["Voice", 'f1d1ed44'],
  "factory:Vocal Percussion (ka)": ["Voice", 'fa0aa21a'],
  "factory:Pluck": ["Plucks & Keys", 'ba904e27'],
  "factory:Bell (Ring)": ["Plucks & Keys", '7d7f2a94'],
  "factory:Music Box": ["Plucks & Keys", '681b5101'],
  "factory:Electric Piano": ["Plucks & Keys", 'ef515cc3'],
  "factory:Supersaw Pluck": ["Plucks & Keys", '6eec2420'],
  "factory:Touch Keys (vel→filter)": ["Plucks & Keys", '749afbf3'],
  "factory:Wavetable Bells (S&H)": ["Plucks & Keys", 'ff956725'],
  "factory:Digital Attack (1shot)": ["Plucks & Keys", '9fe4e5b2'],
  "factory:Lottery Pluck (S&H)": ["Plucks & Keys", '2b65a376'],
  "factory:Nylon Guitar": ["Plucked Strings", 'b1d38d3c'],
  "factory:Twelve-String Guitar": ["Plucked Strings", '1f38eafb'],
  "factory:Harp": ["Plucked Strings", '70424d98'],
  "factory:Koto": ["Plucked Strings", 'c6bdc025'],
  "factory:Plucked Bass": ["Plucked Strings", '80ba0f42'],
  "factory:String Piano": ["Plucked Strings", '99fdbb6a'],
  "factory:String Bell": ["Plucked Strings", '9db8b4d2'],
  "factory:FM Piano (Rhodes)": ["FM", '5b8cb5e2'],
  "factory:DX E-Piano": ["FM", '8ed39031'],
  "factory:FM Brass": ["FM", '620e3205'],
  "factory:FM Clav": ["FM", '7bad3c15'],
  "factory:FM Bass": ["FM", '91a4193c'],
  "factory:DX Bass": ["FM", '00957343'],
  "factory:FM Marimba": ["FM", '4ed2860f'],
  "factory:FM Glockenspiel": ["FM", 'c2fcacd8'],
  "factory:FM Bell": ["FM", '4fa32147'],
  "factory:Tubular Bell": ["FM", '845cce4e'],
  "factory:Metallic Gong": ["FM", '593f4084'],
  "factory:FM Glass Pad": ["FM", '659c4148'],
  "factory:Sci-Fi FM": ["FM", '89c65f13'],
  "factory:DX Bell (env→FM)": ["FM", '5d3f7e41'],
  "factory:DX E-Piano (vel→FM)": ["FM", 'a270076b'],
  "factory:FM Brass (feedback)": ["FM", 'b48a9016'],
  "factory:FM4 · Stacked Brass": ["FM4", '5580e29b'],
  "factory:FM4 · Paired E-Piano": ["FM4", 'a8df9005'],
  "factory:FM4 · Dense Bell": ["FM4", '6e8c7013'],
  "factory:FM4 · Kick": ["FM4", 'f4e854ae'],
  "factory:FM4 · Hat": ["FM4", '8a395dcc'],
  "factory:Tremolo Organ": ["Organ", '54c857dc'],
  "factory:Full Organ": ["Organ", '29d49219'],
  "factory:Church Organ": ["Organ", 'd776ea19'],
  "factory:Wavetable Organ": ["Organ", '44aa53b3'],
  "factory:808 Kick": ["Percussion", 'da125cf1'],
  "factory:909 Kick": ["Percussion", '87cec59e'],
  "factory:Synth Tom": ["Percussion", '889ba108'],
  "factory:Zap Snare": ["Percussion", '2deb8666'],
  "factory:808 Snare": ["Percussion", '9d3dbb60'],
  "factory:808 Clap": ["Percussion", 'd367db5e'],
  "factory:909 Rimshot": ["Percussion", '9a995ee5'],
  "factory:808 Cowbell": ["Percussion", '1c5088d3'],
  "factory:Open Hat": ["Percussion", '169e1556'],
  "factory:FM Hat (feedback)": ["Percussion", '7c4f877b'],
  "factory:909 Crash": ["Percussion", 'b9e7a1d5'],
  "factory:909 Ride": ["Percussion", '30d4fcbe'],
  "factory:Rave Hit": ["Percussion", 'e74cc0a3'],
  "factory:Laser Zap": ["Percussion", '2df405c6'],
  "factory:Rave Hoover": ["Stabs", '787c7171'],
  "factory:Supersaw Stab": ["Stabs", '178c3a32'],
  "factory:Metallic Stab": ["Stabs", '083c6ea1'],
  "factory:S&H Bleeps (random pitch)": ["FX & Atmospheres", '3d04165b'],
  "factory:Sci-Fi Drone": ["FX & Atmospheres", '32f45c14'],
  "factory:Tension Riser": ["FX & Atmospheres", 'fb452489'],
  "factory:Spaceship": ["FX & Atmospheres", '894ac312'],
  "factory:Resonant Blip": ["FX & Atmospheres", '77192b61'],
  "factory:Syncopated Wobble": ["FX & Atmospheres", '8cd2c325'],
  "factory:Tape Dub": ["FX & Atmospheres", '1ab75bfc'],
  "v2:Arp · Acid Squelch": ["Presets 2.0", '01fe2ab9'],
  "v2:Arp · Trance Uplift": ["Presets 2.0", 'df4f5551'],
  "v2:Arp · Crystals at Dawn": ["Presets 2.0", '2c765c0e'],
  "v2:Arp · Motorik Bass": ["Presets 2.0", '510862e9'],
  "v2:Arp · Magic Box": ["Presets 2.0", '5c1dc10f'],
  "v2:Arp · Dark Pulse": ["Presets 2.0", '093f8239'],
  "v2:Cine · Dawn": ["Presets 2.0", '0f3a3263'],
  "v2:Cine · Abyss": ["Presets 2.0", 'e4034f81'],
  "v2:Cine · Spectral Choir": ["Presets 2.0", '5a951ad6'],
  "v2:Cine · Interstellar": ["Presets 2.0", '5e05281f'],
  "v2:Cine · Tundra": ["Presets 2.0", 'ac2930d4'],
  "v2:Cine · Bathysphere": ["Presets 2.0", '0fe3187e'],
  "v2:Hard · Hoover 2.0": ["Presets 2.0", 'aa61b503'],
  "v2:Hard · FM Growl": ["Presets 2.0", '4bdbb021'],
  "v2:Hard · Neuro Wobble": ["Presets 2.0", '9aba532b'],
  "v2:Hard · Gabber Kick": ["Presets 2.0", '93615767'],
  "v2:Hard · Industrial Saw": ["Presets 2.0", 'f957fe71'],
  "v2:Hard · Rave Organ": ["Presets 2.0", '9bdad550'],
  "v2:Rhythm · Trance Gate": ["Presets 2.0", 'dd5341b4'],
  "v2:Rhythm · Sidechain Pump": ["Presets 2.0", '5e38df05'],
  "v2:Rhythm · Helicopter": ["Presets 2.0", '3e5801e9'],
  "v2:Rhythm · Dub Echo": ["Presets 2.0", '0dac4b20'],
  "v2:Rhythm · Sway": ["Presets 2.0", 'fbfdd2d2'],
  "v2:Rhythm · Tremolo Strings": ["Presets 2.0", '014093d5'],
  "v2:Keys · Funky Clavinet": ["Presets 2.0", '6a7cd293'],
  "v2:Keys · Dreamy EP": ["Presets 2.0", 'be05a1ba'],
  "v2:Keys · Leslie Organ": ["Presets 2.0", 'eb2651b5'],
  "v2:Keys · Harpsichord": ["Presets 2.0", '0a398fe4'],
  "v2:Keys · Vibraphone": ["Presets 2.0", 'a2a3e332'],
  "v2:Keys · Accordion": ["Presets 2.0", '30a1ad45'],
  "v2:Texture · Hi-Hat": ["Presets 2.0", '36ba95ff'],
  "v2:Texture · 909 Snare": ["Presets 2.0", 'debdd3f6'],
  "v2:Texture · Waves": ["Presets 2.0", 'e4aba1d1'],
  "v2:Texture · Polar Wind": ["Presets 2.0", 'd7f45c67'],
  "v2:Texture · Old Radio": ["Presets 2.0", 'c8ea63fe'],
  "v2:Texture · Diesel Engine": ["Presets 2.0", '16d70b97'],
  "scene:Night Ambient (demo)": ["Scenes", '6ee3e330'],
  "scene:Dorian Dawn": ["Scenes", '7a200bf9'],
  "scene:Hypnotic Techno": ["Scenes", '89656bfc'],
  "scene:Robot Choir": ["Scenes", '7d9f8263'],
};
