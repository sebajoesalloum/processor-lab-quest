/* Static compatibility scan: lists modern JS/CSS features used by processor-lab.html and the
   oldest Firefox/Safari that supports each (values from MDN browser-compat-data as recalled;
   re-check on caniuse.com before quoting them in a report). Run: node compat_scan.mjs */
import {readFile} from 'node:fs/promises';
const html = await readFile(new URL('./processor-lab.html', import.meta.url), 'utf8');
const js = (html.match(/<script>([\s\S]*?)<\/script>/) || [])[1] || '';
const css = (html.match(/<style>([\s\S]*?)<\/style>/) || [])[1] || '';
const F = (name, re, ff, safari, where='js') => ({name, re, ff, safari, where});
const checks = [
  F('Object.hasOwn()',               /Object\.hasOwn\(/g,           92, '15.4'),
  F('String.replaceAll()',           /\.replaceAll\(/g,             77, '13.1'),
  F('Array/String .at()',            /\.at\(-?\d/g,                 90, '15.4'),
  F('structuredClone()',             /structuredClone\(/g,          94, '15.4'),
  F('Array.findLast()',              /\.findLast(Index)?\(/g,       104, '15.4'),
  F('toSorted/toReversed/with()',    /\.(toSorted|toReversed|toSpliced)\(/g, 115, '16.0'),
  F('Object.fromEntries()',          /Object\.fromEntries\(/g,      63, '12.1'),
  F('Array.flat/flatMap()',          /\.(flat|flatMap)\(/g,         62, '12.0'),
  F('Optional chaining ?.',          /\?\.[A-Za-z_\[(]/g,           74, '13.1'),
  F('Nullish coalescing ??',         /\?\?/g,                       72, '13.1'),
  F('Regex lookbehind',              /\(\?<[=!]/g,                  78, '16.4'),
  F('Private class fields #x',       /\bthis\.#[A-Za-z_]/g,         90, '14.1'),
  F('BigInt literals',               /\b\d+n\b/g,                   68, '14.0'),
  F('Intl.* formatting',             /\bIntl\./g,                   29, '10.0'),
  F('CSS :has()',                    /:has\(/g,                     121, '15.4', 'css'),
  F('CSS :focus-visible',            /:focus-visible/g,             85, '15.4', 'css'),
  F('CSS color-mix()',               /color-mix\(/g,                113, '16.2', 'css'),
  F('CSS aspect-ratio',              /aspect-ratio\s*:/g,           89, '15.0', 'css'),
  F('CSS inset shorthand',           /[;{\s]inset\s*:/g,            66, '14.1', 'css'),
  F('CSS dvh/svh/lvh units',         /\d(dvh|svh|lvh)\b/g,          101, '15.4', 'css'),
  F('CSS flex/grid gap',             /\bgap\s*:/g,                  63, '14.1', 'css'),
  F('CSS backdrop-filter',           /backdrop-filter/g,            103, '9.0', 'css'),
  F('CSS @container',                /@container/g,                 110, '16.0', 'css'),
  F('CSS accent-color',              /accent-color/g,               92, '15.4', 'css'),
  F('CSS @media prefers-reduced-motion', /prefers-reduced-motion/g, 63, '10.1', 'css'),
  F('CSS @media prefers-color-scheme',   /prefers-color-scheme/g,   67, '12.1', 'css'),
  F('CSS custom properties var()',   /var\(--/g,                    31, '9.1', 'css'),
  F('HTML <dialog>',                 /<dialog\b/g,                  98, '15.4', 'html'),
];
const ver = v => String(v).split('.').map(Number);
const gt = (a, b) => { a = ver(a); b = ver(b); for (let i = 0; i < 2; i++) { if ((a[i]||0) !== (b[i]||0)) return (a[i]||0) > (b[i]||0); } return false; };
let maxFF = 0, maxSafari = '0', rows = [];
for (const c of checks) {
  const src = c.where === 'css' ? css : c.where === 'html' ? html : js;
  const n = (src.match(c.re) || []).length;
  if (!n) continue;
  rows.push({feature:c.name, uses:n, firefox:c.ff, safari:c.safari});
  if (c.ff > maxFF) maxFF = c.ff;
  if (gt(c.safari, maxSafari)) maxSafari = c.safari;
}
console.log('Features found in processor-lab.html and the browser versions they need:\n');
for (const r of rows) console.log(`  ${r.feature.padEnd(36)} x${String(r.uses).padEnd(4)} Firefox ${String(r.firefox).padEnd(4)} Safari ${r.safari}`);
console.log(`\nLowest browsers that support everything detected: Firefox ${maxFF}+, Safari ${maxSafari}+`);
console.log('(Chrome/Edge: current versions were tested with Playwright; this scan is static and cannot prove runtime behaviour.)');
if (process.argv.includes('--json')) console.log(JSON.stringify({firefox:maxFF, safari:maxSafari, rows}));
