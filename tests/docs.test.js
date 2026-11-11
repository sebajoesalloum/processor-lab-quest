/* Documentation consistency guard. The 3.0 docs disagreed with each other (80 vs 85 browser checks).
   Counts quoted in the docs must now match the recorded result files, and versions must agree. */
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {VER} from '../src/engine.js';

const read = f => readFile(new URL('../' + f, import.meta.url), 'utf8');
const docs = ['README.md', 'CHANGELOG.md', 'UPGRADE_SUMMARY.md', 'REMAINING_WORK.md'];

test('every "<N> Chromium … checks" claim equals the count in browser-results.txt', async () => {
  const recorded = (await read('browser-results.txt')).match(/BROWSER E2E[^:\n]*:\s*(\d+) passed/);
  assert.ok(recorded, 'browser-results.txt has no "BROWSER E2E: N passed" line');
  let claims = 0;
  for (const f of docs) for (const m of (await read(f)).matchAll(/(\d+) Chromium (?:browser |end-to-end )?checks/g)) {
    claims++; assert.equal(Number(m[1]), Number(recorded[1]), `${f} claims ${m[1]} Chromium checks; browser-results.txt says ${recorded[1]}`);
  }
  assert.ok(claims >= 1, 'no Chromium check count found in the docs');
});
test('every "<N> Node tests" claim equals the count in test-results.txt', async () => {
  const recorded = (await read('test-results.txt')).match(/# tests (\d+)/);
  assert.ok(recorded, 'test-results.txt has no "# tests N" line');
  let claims = 0;
  for (const f of docs) for (const m of (await read(f)).matchAll(/(\d+) Node tests/g)) {
    claims++; assert.equal(Number(m[1]), Number(recorded[1]), `${f} claims ${m[1]} Node tests; test-results.txt says ${recorded[1]}`);
  }
  assert.ok(claims >= 1, 'no Node test count found in the docs');
});
test('version is the same in package.json, the engine, the README title and the newest changelog entry', async () => {
  const pkg = JSON.parse(await read('package.json')).version.replace(/\.0$/, '');
  assert.match(VER, new RegExp('v' + pkg.replace('.', '\\.') + '\\b'));
  assert.match((await read('README.md')).split('\n')[0], new RegExp('Processor Lab ' + pkg.replace('.', '\\.')));
  assert.match((await read('CHANGELOG.md')).match(/^## .*$/m)[0], new RegExp('^## ' + pkg.replace('.', '\\.') + '\\b'));
});
test('docs do not claim Firefox or Safari were verified by automated tests', async () => {
  for (const f of docs) assert.doesNotMatch(await read(f), /(Firefox|Safari)[^.\n]{0,40}\b(passed|verified by|tested by Playwright)/i, f);
});
