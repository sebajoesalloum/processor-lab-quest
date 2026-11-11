/* Independent cross-check: the project's MIPS32/RV32I encodings must match GNU binutils word for word.
   Skipped (not failed) when the GNU cross-assemblers are not installed:
     apt-get install binutils-riscv64-linux-gnu binutils-mips-linux-gnu
   Run directly with: node tools/crosscheck.mjs  (writes crosscheck-results.txt) */
import test from 'node:test';
import assert from 'node:assert/strict';
import { toolchainAvailable, runCrosscheck, rejectionAgreement } from '../tools/crosscheck.mjs';

const skip = toolchainAvailable() ? false : 'GNU binutils (riscv64/mips) not installed';

test('encodings match GNU as for every workload and edge-case program', { skip }, () => {
  const results = runCrosscheck();
  const bad = results.flatMap((r) => r.mismatches);
  assert.deepEqual(bad, []);
  assert.ok(results.length >= 100, 'programs compared: ' + results.length);
});

test('out-of-range RV32I branches: project rejects exactly where GNU cannot emit one B-type word', { skip }, () => {
  for (const r of rejectionAgreement()) assert.ok(r.ours && r.gnu, JSON.stringify(r));
});
