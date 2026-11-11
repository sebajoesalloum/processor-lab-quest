/* Fibonacci edge cases: F(0) = 0 must work on every model (previously returned 1),
   plus boundary inputs and the whole F(0)..F(15) range the UI accepts. */
import test from 'node:test';
import assert from 'node:assert/strict';
import {run, MODELS, WL, mk, step} from '../src/engine.js';

const archs = Object.keys(MODELS);
const F = n => { let a = 0, b = 1; for (let i = 0; i < n; i++) [a, b] = [b, a + b]; return a; };
const fibWorkload = n => ({id: 'FIB', p: 'FIB', mem: {0: n, 9: 0, 10: 1, 11: n, 12: 0, 13: 0}, ex: F(n)});

test('hand-checked reference values: F(0)=0, F(1)=1, F(2)=1, F(10)=55, F(15)=610', () => {
  assert.deepEqual([0, 1, 2, 10, 15].map(F), [0, 1, 1, 55, 610]);
});

test('FIB(0) returns 0 on all four models (regression for the old "returns 1" bug)', () => {
  for (const id of archs) {
    const r = run(id, fibWorkload(0));
    assert.ok(r.ok, `${id} err=${r.err}`);
    assert.equal(r.got, 0, `${id} FIB(0)`);
  }
});

test('FIB boundary and full range F(0)..F(15) on all four models', () => {
  for (let n = 0; n <= 15; n++)
    for (const id of archs) {
      const r = run(id, fibWorkload(n));
      assert.ok(r.ok && r.got === F(n), `${id} FIB(${n}) expected=${F(n)} got=${r.got} err=${r.err}`);
    }
});

test('the shipped default FIB workload (n=7) still produces 13 on all models', () => {
  const w = WL.find(x => x.id === 'FIB');
  assert.equal(w.ex, 13);
  for (const id of archs) assert.equal(run(id, w).got, 13, id);
});

test('FIB(0) executes no loop body: loop-free path is shorter than FIB(1) on every model', () => {
  for (const id of archs) {
    const count = n => { const s = mk(id, fibWorkload(n)); let k = 0; while (!s.halt && k++ < 5000) step(s); return s.tr.length; };
    assert.ok(count(0) < count(1), `${id}: n=0 -> ${count(0)}, n=1 -> ${count(1)}`);
    assert.ok(count(1) < count(2), `${id}: n=1 -> ${count(1)}, n=2 -> ${count(2)}`);
  }
});
