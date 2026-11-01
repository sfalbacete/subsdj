// SubSDJ · renews the sound-fingerprint reference of the factory bank (7.2): subsdj-fingerprints.json.
// Usage:  BANK_OUT=bank.json node tools/run-selftest.mjs "selftest=1&batch=factory"
//         node tools/bank-fp.mjs bank.json [--all]
// The factory batch renders every preset in its use and pings its spectral fingerprint (24 third-octave
// bands × 3 windows, dB, mean-centred) with the hash of its data. This writes, per preset, {fp, print}:
// by default only the presets whose data changed since the reference (or new ones); --all rewrites every
// print. Presets no longer in the bank leave the file. The selftest then fails any preset whose data is
// the same but whose render drifted from its print: the engine changed a sound nobody decided to change.
import fs from 'node:fs'; import path from 'node:path'; import { fileURLToPath } from 'node:url';
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const FILE = path.join(ROOT, 'subsdj-fingerprints.json');
const rows = JSON.parse(fs.readFileSync(process.argv[2], 'utf8')), all = process.argv.includes('--all');
let ref = { format: 'subsdj-fingerprints-v1', presets: {} };
try { ref = JSON.parse(fs.readFileSync(FILE, 'utf8')); } catch (e) { /* first time */ }
const rev = /BANK_REV = (\d+)/.exec(fs.readFileSync(path.join(ROOT, 'js/engine/presets.js'), 'utf8'));
const out = { format: 'subsdj-fingerprints-v1', rev: rev ? +rev[1] : null, date: new Date().toISOString().slice(0, 10),
              bands: 24, windows: 3, note: 'per preset: fp = hash of its data (library.canon/fnv), print = spectral fingerprint of its render (js/selftest.js measurePreset)', presets: {} };
let renewed = 0, kept = 0, removed = 0;
for (const r of rows) {
  if (!r.bank || !r.fp || !r.print) continue;
  const old = (ref.presets || {})[r.bank];
  if (old && old.fp === r.fp && !all) { out.presets[r.bank] = old; kept++; continue; }
  out.presets[r.bank] = { fp: r.fp, print: r.print.split(',').map(Number) };
  renewed++;
  console.log((old ? 'renewed ' : 'new     ') + r.bank);
}
for (const n in ref.presets || {}) if (!out.presets[n]) { removed++; console.log('removed ' + n); }
fs.writeFileSync(FILE, JSON.stringify(out, (k, v) => (k === 'print' ? v.map(x => +x.toFixed(2)) : v), 1).replace(/\n\s+(-?\d+(\.\d+)?),?(?=\n)/g, m => m.trim()) + '\n');
console.log(renewed + ' renewed · ' + kept + ' kept · ' + removed + ' removed → ' + path.relative(ROOT, FILE));
