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

// ---------- the old bank: fingerprints of everything it ever seeded ----------
// The 1.5.0 bank replaces the factory (docs/BANK.md). A library from before carries the old
// factory presets, the «Presets 2.0» bank and the repo scenes as seeded items without a stored
// fingerprint (seedFp came with 1.5.0) — and with the CONTENT of whichever commit seeded them:
// «Restore factory» only ever added what was missing, it never updated a copy, so a library
// seeded before 1.1.0 still had the Masters of that day. This table is built from git (every
// commit that touched presets.js, subsdj-presets-2.0.json or the scenes: 45 commits, 605
// fingerprints), translated with the current migratePreset/migrateScene — what such a library
// holds today: seed key → { s: the sections it was seeded into, f: FNV-1a of each version of
// its canonical data }. library.syncBank removes the copies that match any of them (and are
// not ★); anything renamed, moved or edited stays. The 1.4 bank is archived in subsdj-bank-1.4.json.
export const LEGACY_FP = {
  "factory:Init (default)": { s: ["Basics"], f: ['5465b825'] },
  "factory:Round Sub": { s: ["Bass"], f: ['fea01731', '4f8a06be', '5abea1f0'] },
  "factory:Fat Bass": { s: ["Bass"], f: ['55bc8ad6', 'adfba061', '9d069d53'] },
  "factory:Reese": { s: ["Bass"], f: ['c7824efb', '57c8a63d', 'caf7325b', '7943e36c'] },
  "factory:Pluck Bass": { s: ["Bass"], f: ['ecab68f2', 'dc7f81ae', 'c2cb29dc'] },
  "factory:Acid 303": { s: ["Bass"], f: ['9efbbe62', '96579cc7', 'c51efe7e', '40363344'] },
  "factory:Slide Bass": { s: ["Bass"], f: ['795cd30c', 'c5bb87b7', '20bcff85'] },
  "factory:Dub Wobble": { s: ["Bass"], f: ['0440f650', '25f27e4f', 'bf43c5d5', '4f1d48e4', '2e1d4021'] },
  "factory:Bright Lead": { s: ["Leads"], f: ['8271ddb0', '7c35ab91', '23dfd998', 'fcdd768d'] },
  "factory:Square Lead": { s: ["Leads"], f: ['c48c92c8', '331fb285', '6dcae194', '6f65c108'] },
  "factory:Supersaw Lead": { s: ["Leads"], f: ['9c812308', '5e8cb741', '00eb065d', '1f121475', 'a841b9f4'] },
  "factory:Trance Supersaw": { s: ["Leads"], f: ['3520f7fa', '00d22cd6', '0808c6b7', '8fa98461'] },
  "factory:Mono Glide Lead": { s: ["Leads"], f: ['0e4d8fed', '5b627ac3', '18af3554', '1a7b97aa'] },
  "factory:PWM Lead": { s: ["Leads"], f: ['0f28b7d3', '5edeb660', '30c52b7d', 'f62e3bc1', 'a0ba0432'] },
  "factory:Vibrato Flute": { s: ["Leads"], f: ['05923144', 'c5b6b7d9', '852fe6ae', 'e57430d3'] },
  "factory:Warm Pad": { s: ["Pads"], f: ['041a236c', '29e97cab', 'a2a688a1', '846d87db', 'a1eb7ebd', '01806796'] },
  "factory:PWM Strings": { s: ["Pads"], f: ['370e5157', '16021bda', '8f06a22b', 'c63375f9'] },
  "factory:Supersaw Pad": { s: ["Pads"], f: ['8f17ca39', 'ae8290d3', '99b20692', '25ef55e8', '9c8efca5'] },
  "factory:Glass Pad": { s: ["Pads"], f: ['ddc808ba', '1288953e', '9089a13a', 'c27938e6', '817f8293'] },
  "factory:Evolving Pad": { s: ["Pads"], f: ['fe7a5b46', '17e464a3', 'f7f08864', 'c0e1a05a'] },
  "factory:Choir": { s: ["Pads"], f: ['136fc268', '64d40132', '9a04882e', 'ccc71c4b'] },
  "factory:Pluck": { s: ["Plucks & Keys"], f: ['7c5ddca0', '598961a4', 'ba904e27'] },
  "factory:Bell (Ring)": { s: ["Plucks & Keys"], f: ['17615870', '2b71cdf4', 'a34d2262', '7d7f2a94'] },
  "factory:Music Box": { s: ["Plucks & Keys", "Keys"], f: ['395b7081', 'dcdc834d', '026daf3d', '681b5101', '386d9c2e'] },
  "factory:Electric Piano": { s: ["Plucks & Keys"], f: ['b67c3b57', '77121cc2', 'b6d558ed', 'ef515cc3'] },
  "factory:Supersaw Pluck": { s: ["Plucks & Keys"], f: ['598e558c', 'bf396c12', 'f8fc6015', '6eec2420'] },
  "factory:Tremolo Organ": { s: ["Organ"], f: ['3aecc40a', '99df83fd', 'b3bd5282', '54c857dc'] },
  "factory:Full Organ": { s: ["Organ"], f: ['83b982c7', '7c041e08', 'b47c652f', '29d49219'] },
  "factory:Church Organ": { s: ["Organ", "Keys"], f: ['fc914776', 'b3016816', 'ec603f63', 'd776ea19', '51d8a6f8'] },
  "factory:Rave Hoover": { s: ["Stabs"], f: ['8250dafa', 'caf94b3f', '4b0acb87', '787c7171'] },
  "factory:Supersaw Stab": { s: ["Stabs"], f: ['75911210', '75575b25', 'a349911c', '178c3a32'] },
  "factory:Metallic Stab": { s: ["Stabs"], f: ['56f4c625', '19134ed8', 'd93ea5fd', '083c6ea1'] },
  "factory:Sci-Fi Drone": { s: ["FX & Atmospheres"], f: ['248f0765', '8835dedc', 'f1e4d7d4', '32f45c14'] },
  "factory:Tension Riser": { s: ["FX & Atmospheres"], f: ['66980a27', 'c73554fa', '05c0775e', 'fb452489'] },
  "factory:Spaceship": { s: ["FX & Atmospheres", "FX & Textures"], f: ['c2338e27', '924683fd', 'f0499046', '7ea9ea52', '894ac312', 'b8d153e2'] },
  "factory:Resonant Blip": { s: ["FX & Atmospheres"], f: ['6b055da8', '6deb107a', '3b0a4672', '77192b61'] },
  "factory:FM Piano (Rhodes)": { s: ["FM"], f: ['220352b7', '911fad42', '5b8cb5e2'] },
  "factory:DX E-Piano": { s: ["FM", "Keys"], f: ['d2c94341', 'af8f725c', '8ed39031', '2c2526b2'] },
  "factory:FM Brass": { s: ["FM", "Brass & Strings"], f: ['118cdfc3', '676f0827', '620e3205', 'ef7411f9'] },
  "factory:FM Clav": { s: ["FM"], f: ['9b30ba2c', '945c31d1', '45ce64d8', '7bad3c15'] },
  "factory:FM Bass": { s: ["FM"], f: ['cfdf5555', '7208cca8', '91a4193c'] },
  "factory:DX Bass": { s: ["FM", "Bass"], f: ['18c96c54', '0cf94013', '00957343', 'e91f84ed'] },
  "factory:FM Marimba": { s: ["FM"], f: ['e0a7b549', '8415c4c0', '38fb05d6', '4ed2860f'] },
  "factory:FM Glockenspiel": { s: ["FM"], f: ['0f5c5d06', 'd2737e29', 'c2fcacd8'] },
  "factory:FM Bell": { s: ["FM"], f: ['d55023ec', '7badaeca', '4fa32147'] },
  "factory:Tubular Bell": { s: ["FM"], f: ['f5f9a550', '2eb6cb9d', '845cce4e'] },
  "factory:Metallic Gong": { s: ["FM"], f: ['19a3e191', '104bfbe8', '593f4084'] },
  "factory:FM Glass Pad": { s: ["FM"], f: ['15bf746e', '5c576c01', '8786f2f6', '659c4148'] },
  "factory:Sci-Fi FM": { s: ["FM"], f: ['fdd5c4d2', 'bc870df5', '89c65f13'] },
  "factory:808 Kick": { s: ["Percussion"], f: ['8835358b', '95747482', '39176749', 'da125cf1', '116487dc'] },
  "factory:Synth Tom": { s: ["Percussion"], f: ['292c468f', 'ea37db3c', 'f70dd41d', '889ba108', 'b01ff6ab'] },
  "factory:Zap Snare": { s: ["Percussion"], f: ['5abd374e', '2d654f35', 'eb82f7b6', '2deb8666'] },
  "factory:Laser Zap": { s: ["Percussion", "FX & Textures"], f: ['ff04228e', 'c0386db9', '1a3dd82a', '2df405c6', '56f6a07a'] },
  "factory:String Ensemble": { s: ["Pads"], f: ['378ab0f9', 'bdefdaba', '573b88a6', '27162e6c'] },
  "factory:Syncopated Wobble": { s: ["FX & Atmospheres"], f: ['a66f6e08', 'b4686a83', '8e712f32', '8cd2c325'] },
  "v2:Arp · Acid Squelch": { s: ["Presets 2.0"], f: ['c8c2a36c', '01fe2ab9'] },
  "v2:Arp · Trance Uplift": { s: ["Presets 2.0"], f: ['eae0201c', 'df4f5551'] },
  "v2:Arp · Crystals at Dawn": { s: ["Presets 2.0"], f: ['917f291e', '2c765c0e'] },
  "v2:Arp · Motorik Bass": { s: ["Presets 2.0"], f: ['35cd236e', '510862e9'] },
  "v2:Arp · Magic Box": { s: ["Presets 2.0"], f: ['476aadd7', '5c1dc10f'] },
  "v2:Arp · Dark Pulse": { s: ["Presets 2.0"], f: ['60673f43', '093f8239'] },
  "v2:Cine · Dawn": { s: ["Presets 2.0"], f: ['df368f57', '0f3a3263'] },
  "v2:Cine · Abyss": { s: ["Presets 2.0"], f: ['396f1936', '1c65880b', 'e4034f81'] },
  "v2:Cine · Spectral Choir": { s: ["Presets 2.0"], f: ['dd00277d', '5a951ad6'] },
  "v2:Cine · Interstellar": { s: ["Presets 2.0"], f: ['524245d2', '5e05281f'] },
  "v2:Cine · Tundra": { s: ["Presets 2.0"], f: ['e5a3dcfd', '77307b5c', 'ac2930d4'] },
  "v2:Cine · Bathysphere": { s: ["Presets 2.0"], f: ['36815ffd', '0fe3187e'] },
  "v2:Hard · Hoover 2.0": { s: ["Presets 2.0"], f: ['6a699d7f', 'aa61b503'] },
  "v2:Hard · FM Growl": { s: ["Presets 2.0"], f: ['fd9e8a02', '139c6e51', '4bdbb021'] },
  "v2:Hard · Neuro Wobble": { s: ["Presets 2.0"], f: ['f3690460', '898f015f', '9aba532b'] },
  "v2:Hard · Gabber Kick": { s: ["Presets 2.0"], f: ['c84c8b1f', '93615767'] },
  "v2:Hard · Industrial Saw": { s: ["Presets 2.0"], f: ['d5d63865', 'f957fe71'] },
  "v2:Hard · Rave Organ": { s: ["Presets 2.0"], f: ['23d12872', '9bdad550'] },
  "v2:Rhythm · Trance Gate": { s: ["Presets 2.0"], f: ['e8de9f35', 'dd5341b4'] },
  "v2:Rhythm · Sidechain Pump": { s: ["Presets 2.0"], f: ['ba524d65', '5e38df05'] },
  "v2:Rhythm · Helicopter": { s: ["Presets 2.0"], f: ['96824985', '3e5801e9'] },
  "v2:Rhythm · Dub Echo": { s: ["Presets 2.0"], f: ['2012d246', '0dac4b20'] },
  "v2:Rhythm · Sway": { s: ["Presets 2.0"], f: ['33e0eb37', 'fbfdd2d2'] },
  "v2:Rhythm · Tremolo Strings": { s: ["Presets 2.0"], f: ['1e4e53f9', '014093d5'] },
  "v2:Keys · Funky Clavinet": { s: ["Presets 2.0"], f: ['b5bf1d15', '6a7cd293'] },
  "v2:Keys · Dreamy EP": { s: ["Presets 2.0"], f: ['b22f09c0', 'be05a1ba'] },
  "v2:Keys · Leslie Organ": { s: ["Presets 2.0"], f: ['b957fafb', 'eb2651b5'] },
  "v2:Keys · Harpsichord": { s: ["Presets 2.0"], f: ['7d674013', '0a398fe4'] },
  "v2:Keys · Vibraphone": { s: ["Presets 2.0"], f: ['669c7f83', 'a2a3e332'] },
  "v2:Keys · Accordion": { s: ["Presets 2.0"], f: ['c56e6c1f', '30a1ad45'] },
  "v2:Texture · Hi-Hat": { s: ["Presets 2.0"], f: ['c8c9e147', '36ba95ff'] },
  "v2:Texture · 909 Snare": { s: ["Presets 2.0"], f: ['ef6fad7e', 'debdd3f6'] },
  "v2:Texture · Waves": { s: ["Presets 2.0"], f: ['c1423132', '79fd0609', 'e4aba1d1'] },
  "v2:Texture · Polar Wind": { s: ["Presets 2.0"], f: ['159c3af2', 'd7f45c67'] },
  "v2:Texture · Old Radio": { s: ["Presets 2.0"], f: ['5d04ef55', 'c8ea63fe'] },
  "v2:Texture · Diesel Engine": { s: ["Presets 2.0"], f: ['3650f39b', '16d70b97'] },
  "factory:Solina Strings": { s: ["Pads", "Brass & Strings"], f: ['adb2caf7', 'f35c52ea', '67ebd94c', '724bf1b1'] },
  "factory:PWM Ensemble": { s: ["Pads", "Brass & Strings"], f: ['338b4b1d', 'df3d2e9c', 'e764770e', 'df2468d5'] },
  "factory:Creamy Bass (24 dB)": { s: ["Bass"], f: ['b1c91623', '284576bb', 'c77acdda'] },
  "factory:Butter Pad": { s: ["Pads"], f: ['a311e739', '96c0dd2d', 'b3c5e7a7'] },
  "factory:Cathedral Pad": { s: ["Pads"], f: ['9d57d354', '4255b54e', 'a407b547', '3e4aac03'] },
  "factory:PWM Unison Pad": { s: ["Pads"], f: ['bfa31cdb', '64293a81', '287c5ba7'] },
  "factory:Air Pad": { s: ["Pads"], f: ['50b8f02b', 'c9f3dfc7', '9b9749c0'] },
  "factory:Matrix Pad": { s: ["Pads"], f: ['a06de1c5', 'b2e3e925', '162ce5b3'] },
  "factory:Chameleon Bass (note→PW)": { s: ["Bass"], f: ['10ba3bd3', '5f731ba4', '83a951fe'] },
  "factory:Vibrato Wah": { s: ["Leads"], f: ['1fe86f23', 'cad11556', '015c2823'] },
  "factory:Organic Drift": { s: ["Pads"], f: ['284a15d4', 'f2c756a2', '50857b33'] },
  "factory:Touch Keys (vel→filter)": { s: ["Plucks & Keys"], f: ['0a83980a', 'b12b896f', '749afbf3'] },
  "factory:Lottery Pluck (S&H)": { s: ["Plucks & Keys"], f: ['1265a87a', 'ac6399fb', '2b65a376'] },
  "factory:Vowel Choir (wavetable)": { s: ["Pads"], f: ['d31339d0', '6c762829', '7542899f'] },
  "factory:Wavetable Bells (S&H)": { s: ["Plucks & Keys"], f: ['2e06eba5', '9f5c9ad9', 'ff956725'] },
  "factory:Wavetable Organ": { s: ["Organ"], f: ['0a08ee71', '8052f8e1', '44aa53b3'] },
  "factory:Human Choir": { s: ["Voice"], f: ['8f92df15', 'e02231e2', 'a4012ae0', 'f1d0c813'] },
  "factory:Talking Robot": { s: ["Voice"], f: ['5b40793e', '6fcb47b1', 'a0adadf7', '3e90ba7e'] },
  "factory:Madrigal (vowel per note)": { s: ["Voice"], f: ['09a3cf73', '5437551f', '6ac894fd'] },
  "factory:Glottal Voice (effort)": { s: ["Voice"], f: ['fcf5dcdf', '339e7b00', 'f1d1ed44'] },
  "factory:Vocal Percussion (ka)": { s: ["Voice"], f: ['f4d3b1d3', 'd191a36c', '7d26f09a', 'fa0aa21a'] },
  "factory:Wavestation Texture (ws)": { s: ["Pads"], f: ['fb1046fa', '4a980078', 'c1727d66'] },
  "factory:Digital Attack (1shot)": { s: ["Plucks & Keys"], f: ['31a0cdef', '3259ceae', '9fe4e5b2'] },
  "factory:Tape Dub": { s: ["FX & Atmospheres", "Motion"], f: ['fedcf940', '82a0c7c9', '1ab75bfc', 'a2051a84'] },
  "factory:DX Bell (env→FM)": { s: ["FM"], f: ['61458c5c', '3e202cde', '5d3f7e41'] },
  "factory:DX E-Piano (vel→FM)": { s: ["FM"], f: ['b3a43a01', '3569c72e', 'a270076b'] },
  "factory:FM Brass (feedback)": { s: ["FM"], f: ['a7a83f37', '27894440', 'b48a9016'] },
  "factory:FM Hat (feedback)": { s: ["Percussion"], f: ['31976547', 'f884dc8e', '7f784073', '7c4f877b'] },
  "scene:Dorian Dawn": { s: ["Scenes"], f: ['1966025a', '16c1f134', '7a200bf9', '72c4a944', 'c1df99e8'] },
  "scene:Night Ambient (demo)": { s: ["Scenes"], f: ['0e1cd584', 'df7a495d', '6ee3e330', 'bcf0edd0'] },
  "scene:Robot Choir": { s: ["Scenes"], f: ['eb29e27b', '00ef5f35', '164b6e44', '7d9f8263', 'c07e85fd', 'ac9c985a'] },
  "scene:Hypnotic Techno": { s: ["Scenes"], f: ['b1aae384', '34bd3a76', '89656bfc', 'fc538161', '0b6d5ac8'] },
  "factory:Plate Pad": { s: ["Pads"], f: ['32018b22', '1b6f006d', 'c8f98d63'] },
  "factory:FM4 · Stacked Brass": { s: ["FM4"], f: ['d56bfa89', 'c254afc3', '5580e29b'] },
  "factory:FM4 · Paired E-Piano": { s: ["FM4"], f: ['a55c0582', '3c74c59d', 'a8df9005'] },
  "factory:FM4 · Dense Bell": { s: ["FM4"], f: ['50ffc580', '300acf23', '6e8c7013'] },
  "factory:FM4 · Kick": { s: ["FM4"], f: ['eccc5536', '55b7ff44', 'cb018f4a', 'f4e854ae'] },
  "factory:FM4 · Hat": { s: ["FM4"], f: ['779e245d', '34fa97b4', '625c47d8', '8a395dcc'] },
  "factory:RC Bass (curve)": { s: ["Bass"], f: ['03f2c7b3', 'd638aca5', '7d3e3cd1'] },
  "factory:Phaser Pad (notch)": { s: ["Pads"], f: ['b74240ff', '6e089ad1', '46090293'] },
  "factory:S&H Lead (random filter)": { s: ["Leads"], f: ['4e88834b', 'ca0e1fa6', '4f5ef5b2'] },
  "factory:Breathing Pad (drift)": { s: ["Pads"], f: ['1b16640d', '1c05d2c5', '27ad051f'] },
  "factory:S&H Bleeps (random pitch)": { s: ["FX & Atmospheres"], f: ['044f22ee', 'e13df6a4', '3d04165b'] },
  "factory:909 Kick": { s: ["Percussion"], f: ['89d90576', 'f3b1c677', '87cec59e', 'bd94316b'] },
  "factory:808 Snare": { s: ["Percussion"], f: ['edd59371', '843d568c', '9d3dbb60', '27055af4'] },
  "factory:808 Clap": { s: ["Percussion"], f: ['24521201', '929b186e', 'd367db5e', 'd1dfcc07'] },
  "factory:909 Rimshot": { s: ["Percussion"], f: ['2a069c46', '01165275', '9a995ee5', '87990830'] },
  "factory:808 Cowbell": { s: ["Percussion"], f: ['aef4cfc6', '23872b4b', '1c5088d3', '190ebac9'] },
  "factory:Open Hat": { s: ["Percussion"], f: ['a90de51e', '310803ba', '169e1556', '452ca596'] },
  "factory:909 Crash": { s: ["Percussion"], f: ['0703f17d', 'c316a491', 'b9e7a1d5', '4ba1cd0c'] },
  "factory:909 Ride": { s: ["Percussion"], f: ['5959840d', '996074ee', '30d4fcbe', 'f1d78ded'] },
  "factory:Rave Hit": { s: ["Percussion"], f: ['1e34c524', 'dfbb030d', 'e74cc0a3'] },
  "factory:Glacial Pad (12 s attack)": { s: ["Cinescape"], f: ['2ef70739', '2a0e6361', 'a565935c'] },
  "factory:Basement Drone (−2 octaves)": { s: ["Cinescape"], f: ['ea3c768c', '0047963f', '0da919ec'] },
  "factory:Four Winds Pad (per-voice drift)": { s: ["Cinescape"], f: ['3cb1bc65', 'b0967b56', 'e992ddcb'] },
  "factory:Shimmer Pad (rising choir)": { s: ["Cinescape"], f: ['440e1ea3', '63d277c3', '548d7b84'] },
  "factory:Performance Pad (wheel, aftertouch, pedal)": { s: ["Cinescape"], f: ['5f1fc5ff', 'd96f7ece', 'db0c1e7b'] },
  "factory:Tape Pad (nostalgia)": { s: ["Cinescape"], f: ['884a03d8', 'a677e22f', '3d6867fe'] },
  "factory:Singing Bowl (noise + resonator)": { s: ["Cinescape"], f: ['ecff85ea', '8d8f8924', 'edfdf890'] },
  "factory:Bowed Metal (saw + resonator)": { s: ["Cinescape"], f: ['85758400', 'c59afbf2', '6f05c1a1'] },
  "factory:One S&H, Three Targets": { s: ["Stepped"], f: ['d4e0479e', '461211b3', '17211cff'] },
  "factory:Table, Filter and Gate (16 · 8 · triplet)": { s: ["Stepped"], f: ['07acb018', '36fcc055', '5d1eeb53'] },
  "factory:Eight-Step Stairs (3 square LFOs)": { s: ["Stepped"], f: ['fe48d2aa', '9e45a40c', '794bc9a7'] },
  "factory:LFO Melody (whole tone)": { s: ["Stepped"], f: ['9cf5f79f', 'a74ff556', '361c2eae'] },
  "factory:Talking Chord (per-voice S&H)": { s: ["Stepped"], f: ['80b8d02d', '916d1303', 'c1b75f6f'] },
  "factory:Three Cycles, 30 s Around (5 · 6 · 8 · 16)": { s: ["Stepped"], f: ['3ac1d332', '73756db7', '458f4e29'] },
  "factory:Nylon Guitar": { s: ["Plucked Strings", "Plucks & Bells"], f: ['b1d38d3c', 'd72c902f'] },
  "factory:Twelve-String Guitar": { s: ["Plucked Strings"], f: ['1f38eafb'] },
  "factory:Harp": { s: ["Plucked Strings", "Plucks & Bells"], f: ['70424d98', '37bfe543'] },
  "factory:Koto": { s: ["Plucked Strings", "Plucks & Bells"], f: ['c6bdc025', '625db018'] },
  "factory:Plucked Bass": { s: ["Plucked Strings", "Bass"], f: ['80ba0f42', 'e8287a9e'] },
  "factory:String Piano": { s: ["Plucked Strings"], f: ['99fdbb6a'] },
  "factory:String Bell": { s: ["Plucked Strings"], f: ['9db8b4d2'] },
  "factory:Init": { s: ["Basics"], f: ['5465b825'] },
  "factory:Sub Bass": { s: ["Bass"], f: ['2af2421e'] },
  "factory:Moog Bass": { s: ["Bass"], f: ['4e2f7409'] },
  "factory:Funk Bass": { s: ["Bass"], f: ['6fce3c44'] },
  "factory:Fat Saw Bass": { s: ["Bass"], f: ['a996f262'] },
  "factory:Neuro Bass": { s: ["Bass"], f: ['62989a90'] },
  "factory:Sync Bass": { s: ["Bass"], f: ['27e058fe'] },
  "factory:Moog Lead": { s: ["Leads"], f: ['1e75dfe2'] },
  "factory:Sync Lead": { s: ["Leads"], f: ['c187f31f'] },
  "factory:Fold Lead": { s: ["Leads"], f: ['32fa3e35'] },
  "factory:Hoover": { s: ["Leads"], f: ['c1f7aa83'] },
  "factory:Breath Flute": { s: ["Leads"], f: ['4e37fff8'] },
  "factory:Vox Lead": { s: ["Leads"], f: ['e0039a88'] },
  "factory:S&H Lead": { s: ["Leads"], f: ['36d0de7a'] },
  "factory:Juno Brass": { s: ["Brass & Strings"], f: ['89eedeff'] },
  "factory:OB Brass": { s: ["Brass & Strings"], f: ['40f895f3'] },
  "factory:Brass Stab": { s: ["Brass & Strings"], f: ['913b7ed6'] },
  "factory:Orchestra Hit": { s: ["Brass & Strings"], f: ['e1db4bd4'] },
  "factory:Pizzicato": { s: ["Brass & Strings"], f: ['bf6a0995'] },
  "factory:Rhodes": { s: ["Keys"], f: ['4cd1573c'] },
  "factory:Clavinet": { s: ["Keys"], f: ['0d2c34e3'] },
  "factory:Harpsichord": { s: ["Keys"], f: ['0eb47325'] },
  "factory:Drawbar Organ": { s: ["Keys"], f: ['9119881e'] },
  "factory:Vibraphone": { s: ["Keys"], f: ['96c50a8c'] },
  "factory:Marimba": { s: ["Keys"], f: ['0b9fb673'] },
  "factory:Accordion": { s: ["Keys"], f: ['7396e150'] },
  "factory:Digital Keys": { s: ["Keys"], f: ['3791629f'] },
  "factory:Synth Pluck": { s: ["Plucks & Bells"], f: ['891b70a4'] },
  "factory:Twelve-String": { s: ["Plucks & Bells"], f: ['384ab158'] },
  "factory:Glockenspiel": { s: ["Plucks & Bells"], f: ['41ea89b0'] },
  "factory:Tubular Bells": { s: ["Plucks & Bells"], f: ['12a10c00'] },
  "factory:Crystal Bell": { s: ["Plucks & Bells"], f: ['632d7076'] },
  "factory:Gong": { s: ["Plucks & Bells"], f: ['ee5ec9cf'] },
  "factory:Vowel Choir": { s: ["Pads"], f: ['0014d62b'] },
  "factory:Breathing Pad": { s: ["Pads"], f: ['d1d39356'] },
  "factory:Phaser Pad": { s: ["Pads"], f: ['0f9c482b'] },
  "factory:Wave Sequence Pad": { s: ["Pads"], f: ['adc676f1'] },
  "factory:Dawn Pad": { s: ["Pads"], f: ['49d518ea'] },
  "factory:Vector Pad": { s: ["Pads"], f: ['8c756c8e'] },
  "factory:Glacier Pad": { s: ["Cinescape"], f: ['17f2869f'] },
  "factory:Basement Drone": { s: ["Cinescape"], f: ['4a45e08b'] },
  "factory:Four Winds": { s: ["Cinescape"], f: ['60e98d74'] },
  "factory:Shimmer Choir": { s: ["Cinescape"], f: ['644bd980'] },
  "factory:Expressive Pad": { s: ["Cinescape"], f: ['63431908'] },
  "factory:Nostalgia Tape": { s: ["Cinescape"], f: ['e743322a'] },
  "factory:Singing Bowl": { s: ["Cinescape"], f: ['4cc49d05'] },
  "factory:Bowed Metal": { s: ["Cinescape"], f: ['2196df60'] },
  "factory:Interstellar": { s: ["Cinescape"], f: ['936279ed'] },
  "factory:Acid Line": { s: ["Motion"], f: ['18076502'] },
  "factory:Berlin Sequence": { s: ["Motion"], f: ['2a7d54df'] },
  "factory:Uplift Arp": { s: ["Motion"], f: ['04b7f01b'] },
  "factory:Crystal Arp": { s: ["Motion"], f: ['2a102483'] },
  "factory:Motorik Bass": { s: ["Motion"], f: ['ffecf15e'] },
  "factory:Trance Gate": { s: ["Motion"], f: ['e3387455'] },
  "factory:Pumping Pad": { s: ["Motion"], f: ['584ebdf4'] },
  "factory:Polymeter Steps": { s: ["Motion"], f: ['5517f9c6'] },
  "factory:Steps Melody": { s: ["Motion"], f: ['041adbe8'] },
  "factory:Talking Chord": { s: ["Motion"], f: ['fd787ac9'] },
  "factory:909 Snare": { s: ["Percussion"], f: ['0ef5842d'] },
  "factory:Closed Hat": { s: ["Percussion"], f: ['bcf95b08'] },
  "factory:Madrigal": { s: ["Voice"], f: ['862e06c0'] },
  "factory:Solo Voice": { s: ["Voice"], f: ['3d0b5e21'] },
  "factory:Syllables": { s: ["Voice"], f: ['02908bc9'] },
  "factory:Riser": { s: ["FX & Textures"], f: ['79163996'] },
  "factory:Sonar": { s: ["FX & Textures"], f: ['32a27172'] },
  "factory:Computer": { s: ["FX & Textures"], f: ['2e76506c'] },
  "factory:Old Radio": { s: ["FX & Textures"], f: ['87cc08d0'] },
  "factory:Polar Wind": { s: ["FX & Textures"], f: ['75da0f7c'] },
  "factory:Ocean": { s: ["FX & Textures"], f: ['5c27e8e2'] },
  "scene:Berlin School": { s: ["Scenes"], f: ['b405d219'] },
  "scene:Deep Space": { s: ["Scenes"], f: ['7fd23f55'] },
  "scene:Dub Session": { s: ["Scenes"], f: ['16b6cb95'] },
  "scene:909 Kit": { s: ["Scenes"], f: ['9dc2c09b'] },
  "scene:Night Ambient": { s: ["Scenes"], f: ['ce2e04a0'] },
};
