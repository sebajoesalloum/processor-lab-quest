/* Deterministic randomized differential tests: every workload family is executed on all four
   reference models with seeded pseudo-random inputs and compared against a plain JS oracle.
   Restores (and extends) the 2.1 randomized suite that the 3.0 rewrite dropped. */
import test from 'node:test';
import assert from 'node:assert/strict';
import {run,MODELS} from '../src/engine.js';

const archs = Object.keys(MODELS);
function rng(seed) { let s = seed >>> 0; return () => (s = (Math.imul(s, 1664525) + 1013904223) >>> 0); }
const fibOracle = n => { let a = 0, b = 1; for (let i = 0; i < n; i++) [a, b] = [b, a + b]; return a; };   // F(0)=0, F(1)=1; defined for n>=0

const families = {
  ADD:      {n:75, make:(v,next)=>{const a=v(),b=v();return {mem:{0:a,1:b},ex:a+b}}},
  COPY:     {n:75, make:(v)=>{const a=v();return {mem:{0:a},ex:a}}},
  NEG:      {n:75, make:(v)=>{const a=v();return {mem:{0:a},ex:-a}}},
  EXPR:     {n:75, make:(v)=>{const a=v(),b=v(),c=v();return {mem:{0:a,1:b,2:c},ex:a+b-c}}},
  MAX:      {n:75, make:(v)=>{const a=v(),b=v();return {mem:{0:a,1:b},ex:Math.max(a,b)}}},
  SUMN:     {n:75, make:(v,next)=>{const n=1+next()%30;return {mem:{0:n},ex:n*(n+1)/2}}},
  ARR:      {n:75, make:(v)=>{const a=v(),b=v(),c=v(),d=v();return {mem:{0:4,10:a,11:b,12:c,13:d},ex:a+b+c+d}}},
  ARR_LOOP: {n:75, make:(v)=>{const a=v(),b=v(),c=v(),d=v();return {mem:{0:4,9:-1,10:a,11:b,12:c,13:d,14:10,15:4},ex:a+b+c+d}}},
  MAXARR:   {n:75, make:(v)=>{const a=v(),b=v(),c=v(),d=v();return {mem:{0:0,10:a,11:b,12:c,13:d},ex:Math.max(a,b,c,d)}}},
  FIB:      {n:30, make:(v,next)=>{const n=next()%26;return {mem:{0:n,9:0,10:1,11:n,12:0,13:0},ex:fibOracle(n)}}},
};

let executions = 0;
for (const [family, {n, make}] of Object.entries(families)) {
  test('randomized four-architecture ' + family, () => {
    const next = rng(0xBEEF ^ family.length * 7919);
    const v = () => next() % 2001 - 1000;
    for (let k = 0; k < n; k++) {
      const {mem, ex} = make(v, next);
      const w = {id:family, p:family, mem, ex};
      for (const id of archs) {
        const r = run(id, w); executions++;
        assert.ok(r.ok && r.got === ex, `${id} ${family} ${JSON.stringify(mem)} expected=${ex} got=${r.got} err=${r.err}`);
      }
    }
  });
}

test('MAX covers both branch directions and sign boundaries', () => {
  for (const [a, b] of [[0,0],[1,0],[0,1],[-1,-2],[-2,-1],[1000,-1000],[-1000,1000],[500,500]])
    for (const id of archs) {
      const r = run(id, {id:'MAX', p:'MAX', mem:{0:a,1:b}, ex:Math.max(a,b)});
      assert.ok(r.ok, `${id} max(${a},${b}) got=${r.got}`);
    }
});

test('randomized suite really executed thousands of programs', () => {
  assert.ok(executions >= 2800, 'executions=' + executions);
});
