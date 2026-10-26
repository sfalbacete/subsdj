// SubSDJ · report on the factory bank from Node (no browser): metadata problems,
// presets per category, tag counts, and the coverage table of engine/bankCheck.js
// (which presets show each feature, and the holes). Usage: node tools/bank-report.mjs [--full]
import path from 'node:path'; import { pathToFileURL } from 'node:url'; import { fileURLToPath } from 'node:url';
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const mod = p => import(pathToFileURL(path.join(ROOT, p)).href);
const { BANK, BANK_REV, META } = await mod('js/engine/presets.js');
const { validateBank, coverage } = await mod('js/engine/bankCheck.js');
const full = process.argv.includes('--full');

const n = Object.keys(META).length;
console.log(`bank rev ${BANK_REV}: ${n} presets in ${BANK.length} categories`);
for (const c of BANK) console.log('  ' + String(c.presets.length).padStart(3) + '  ' + c.cat + (full ? ': ' + c.presets.map(p => p.name).join(' · ') : ''));
const problems = validateBank();
console.log(problems.length ? 'metadata problems:\n  ' + problems.join('\n  ') : 'metadata: ok');
const tags = {};
for (const c of BANK) for (const p of c.presets) for (const t of p.tags || []) tags[t] = (tags[t] || 0) + 1;
console.log('tags: ' + Object.entries(tags).sort((a, b) => b[1] - a[1]).map(([t, k]) => t + ' ' + k).join(' · '));
const cov = coverage();
console.log('coverage: ' + (cov.features.length - cov.holes.length) + '/' + cov.features.length + ' features' + (cov.holes.length ? ' · HOLES: ' + cov.holes.join(', ') : ''));
if (full) for (const f of cov.features) console.log('  ' + String(f.presets.length).padStart(3) + '  ' + f.label.padEnd(34) + (f.presets.length ? f.presets.slice(0, 8).join(' · ') + (f.presets.length > 8 ? ' …' : '') : '—'));
process.exit(problems.length || cov.holes.length ? 1 : 0);
