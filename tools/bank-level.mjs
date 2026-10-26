// SubSDJ · writes the Masters suggested by the factory batch into js/engine/presets.js.
// Usage:  BANK_OUT=bank.json node tools/run-selftest.mjs "selftest=1&batch=factory"
//         node tools/bank-level.mjs bank.json [--all]
// By default only the presets the batch flagged (ok=0) are touched; --all moves every preset
// to its suggestion (tightens the whole bank to −14 LUFS / the hit peak). Prints what changed.
import fs from 'node:fs'; import path from 'node:path'; import { fileURLToPath } from 'node:url';
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const file = path.join(ROOT, 'js/engine/presets.js');
const rows = JSON.parse(fs.readFileSync(process.argv[2], 'utf8')), all = process.argv.includes('--all');
let src = fs.readFileSync(file, 'utf8'), n = 0;
for (const r of rows) {
  if (!r.sugg || r.sugg === 'undefined' || (!all && r.ok === '1')) continue;
  const sugg = +r.sugg, cur = +r.master;
  if (!(sugg > 0) || Math.abs(sugg - cur) / cur < 0.02) continue;
  const at = src.indexOf("{ name: '" + r.bank.replace(/'/g, "\\'") + "'");
  if (at < 0) { console.log('not found:', r.bank); continue; }
  const next = src.indexOf('{ name: ', at + 8), end = next < 0 ? src.length : next;
  const seg = src.slice(at, end), m = /master: ([0-9.]+)/.exec(seg);
  if (!m) { console.log('no master:', r.bank); continue; }
  src = src.slice(0, at) + seg.replace(m[0], 'master: ' + sugg) + src.slice(end);
  console.log(r.bank.padEnd(20), m[1], '→', sugg, r.use === 'hit' ? '(peak ' + r.peak + ')' : '(' + r.lufs + ' LUFS)');
  n++;
}
fs.writeFileSync(file, src);
console.log(n + ' masters written');
