/* In-browser self-test. Executed by browser-selftest.html on the machine you will present from
   (Firefox, Safari, Chrome, ...). It exercises the same engine code that processor-lab.html bundles:
   JavaScript features the app uses, every workload on every model, the pipeline (both branch
   policies), the cache, the custom ISA and a few encoding vectors. It cannot judge visual layout. */
import { WL, MODELS, asm, mk, step, run, PROG } from './engine.js';
import { encodeInstruction } from './encoders.js';
import { simulatePipeline, traceToPipelineInput } from './pipeline.js';
import { simulateDirectMappedCache, simulateCache, parseAccessList } from './cache.js';
import { explainPipeline } from './pipeline.js';
import { describeInstruction } from './datapath.js';
import { demoForwarding, demoCache, demoIsaComparison } from './demo.js';
import { customRun, CUSTOM_EXAMPLE } from './custom-isa.js';
import { esc, hasOwn } from './util.js';

export function runSelfTests() {
  const out = [];
  const t = (group, name, fn) => {
    try {
      const detail = fn();
      out.push({ group, name, ok: true, detail: detail === undefined ? '' : String(detail) });
    } catch (e) {
      out.push({ group, name, ok: false, detail: String((e && e.message) || e) });
    }
  };
  const eq = (a, b, what) => {
    if (a !== b) throw new Error((what || 'value') + ': expected ' + b + ', got ' + a);
  };
  const syntax = (src) => {
    new Function(src);
    return 'supported';
  };

  // 1. Language features the app relies on (a failure here means the browser is too old).
  t('JavaScript features', 'optional chaining ?.', () => syntax('const o={}; return o?.a?.b'));
  t('JavaScript features', 'nullish coalescing ??', () => syntax('return null ?? 1'));
  t(
    'JavaScript features',
    'Array flat / flatMap',
    () => eq([[1], [2]].flat().length, 2) || eq([1].flatMap((x) => [x, x]).length, 2) || 'supported'
  );
  t(
    'JavaScript features',
    'Object.fromEntries',
    () => eq(Object.fromEntries([['a', 1]]).a, 1) || 'supported'
  );
  t('JavaScript features', 'Blob + object URLs (exports)', () => {
    const u = URL.createObjectURL(new Blob(['x']));
    URL.revokeObjectURL(u);
    return 'supported';
  });
  t('JavaScript features', 'matchMedia (theme, reduced motion)', () => {
    if (typeof matchMedia !== 'function') throw new Error('missing');
    return 'reduced-motion=' + matchMedia('(prefers-reduced-motion: reduce)').matches;
  });
  t('JavaScript features', 'CSS :focus-visible', () => {
    if (!(window.CSS && CSS.supports && CSS.supports('selector(:focus-visible)')))
      throw new Error('focus rings will not show on this browser');
    return 'supported';
  });
  t('JavaScript features', 'window.print available (PDF export)', () => {
    if (typeof window.print !== 'function') throw new Error('missing');
    return 'present';
  });

  // 2. Every workload on every model.
  for (const w of WL)
    for (const id of Object.keys(MODELS)) {
      t('Workloads on all models', w.id + ' on ' + id, () => {
        const r = run(id, w);
        if (!r.ok) throw new Error('got ' + r.got + (r.err ? ' (' + r.err + ')' : ''));
        eq(r.got, w.ex, 'result');
        return r.got;
      });
    }

  // 3. Pipeline: hand-calculated numbers.
  const seq = [
    { t: 'beq t1,t2,x', taken: false },
    'addi t3,t3,1',
    { t: 'bne t4,t5,x', taken: true },
    'addi t6,t6,1',
  ];
  t('Pipeline', 'fill/drain: 4 independent instructions = 8 cycles', () =>
    eq(simulatePipeline(seq, { arch: 'rv', branchPenalty: 0 }).cycles, 8, 'cycles')
  );
  t('Pipeline', 'penalty 3, every branch = 14 cycles', () =>
    eq(simulatePipeline(seq, { arch: 'rv', branchPenalty: 3, branchPolicy: 'every' }).cycles, 14, 'cycles')
  );
  t('Pipeline', 'penalty 3, taken only = 11 cycles', () =>
    eq(simulatePipeline(seq, { arch: 'rv', branchPenalty: 3, branchPolicy: 'taken' }).cycles, 11, 'cycles')
  );
  t('Pipeline', 'load-use costs one bubble with forwarding', () =>
    eq(
      simulatePipeline(['lw t0,0(a0)', 'add t1,t0,t2'], { arch: 'rv', forwarding: true, branchPenalty: 0 })
        .dataStalls,
      1,
      'stalls'
    )
  );
  t('Pipeline', 'unknown opcode is rejected loudly', () => {
    try {
      simulatePipeline(['mul t0,t1,t2'], { arch: 'rv' });
    } catch (e) {
      return 'rejected';
    }
    throw new Error('accepted an unsupported opcode');
  });
  t('Pipeline', 'every workload schedules on RV32I and MIPS32', () => {
    for (const arch of ['rv', 'mips'])
      for (const w of WL) {
        const s = mk(arch, w);
        let n = 0;
        while (!s.halt && n++ < 5000) step(s);
        simulatePipeline(traceToPipelineInput(s.tr), { arch, branchPolicy: 'taken' });
      }
    return 'ok';
  });

  // 4. Cache.
  t('Cache', 'hits/misses/AMAT hand calculation', () => {
    const c = simulateDirectMappedCache([0, 4, 16, 0], {
      cacheSize: 64,
      blockSize: 16,
      hitTime: 1,
      missPenalty: 20,
    });
    eq(c.hits, 2, 'hits');
    eq(c.misses, 2, 'misses');
    eq(c.amat, 11, 'AMAT');
  });

  // 5. Encodings and custom ISA.
  t('Encodings', 'MIPS32 addu $t2,$t0,$t1 = 0x01095021', () =>
    eq(encodeInstruction('mips', asm(MODELS.mips, ['addu $t2,$t0,$t1'])[0], 0).hex, '0x01095021')
  );
  t('Encodings', 'RV32I lw t0,0(a0) = 0x00052283', () =>
    eq(encodeInstruction('rv', asm(MODELS.rv, ['lw t0,0(a0)'])[0], 0).hex, '0x00052283')
  );
  t('Encodings', 'RV32I lui t0,1 = 0x000012B7', () =>
    eq(encodeInstruction('rv', asm(MODELS.rv, ['lui t0,1'])[0], 0).hex, '0x000012B7')
  );
  t('Custom ISA', 'addition program stores 12 in cell 3', () =>
    eq(customRun(CUSTOM_EXAMPLE, 4, 32).mem[3], 12, 'memory[3]')
  );
  t('Custom ISA', '8-bit data wraps 127 + 1 to -128', () =>
    eq(customRun('MOVI r0,127\nMOVI r1,1\nADD r0,r1\nSTORE r0,3\nHALT', 4, 8, 24).mem[3], -128, 'memory[3]')
  );
  t('4.0 pipeline', 'forwarding demo: 18 cycles off, 12 on, no stale operands', () => {
    const r = demoForwarding();
    eq(r.A.cycles, 18, 'off');
    eq(r.B.cycles, 12, 'on');
    eq(r.A.operandMismatches.length + r.B.operandMismatches.length, 0, 'mismatches');
  });
  t('4.0 pipeline', 'every workload: delivered operands equal interpreter values', () => {
    let n = 0;
    for (const arch of ['rv', 'mips'])
      for (const w of WL) {
        const s = mk(arch, w);
        while (!s.halt) step(s);
        for (const forwarding of [true, false]) {
          const e = explainPipeline(s.tr, { arch, forwarding });
          if (e.operandMismatches.length) throw new Error(arch + ' ' + w.id);
          n += e.operands.length;
        }
      }
    return n + ' operands checked';
  });
  t('4.0 datapath', 'MIPS addu $t2,$t0,$t1 shows 7 + 5 = 12', () => {
    const s = mk('mips', WL.find((w) => w.id === 'ADD'));
    while (!s.halt) step(s);
    const d = describeInstruction('mips', s.tr[2], s.p[2]);
    eq(d.alu.result, 12, 'ALU');
    eq(d.aluChecked, true, 'cross-check');
  });
  t('4.0 cache', 'LRU keeps the reused block (5 hits), FIFO does not (3 hits)', () => {
    const seq = parseAccessList('0 32 0 64 0 32 0 64 0 32 0 64');
    eq(simulateCache(seq, { cacheSize: 64, blockSize: 16, associativity: 2, policy: 'LRU' }).hits, 5, 'LRU');
    eq(simulateCache(seq, { cacheSize: 64, blockSize: 16, associativity: 2, policy: 'FIFO' }).hits, 3, 'FIFO');
  });
  t('4.0 cache', 'interleaved arrays: 0 / 28 / 28 hits', () =>
    eq(demoCache('interleaved').results.map((r) => r.hits).join('/'), '0/28/28')
  );
  t('4.0 demo', 'MIPS32 runs 8 more instructions than RV32I on Fibonacci(7)', () =>
    eq(demoIsaComparison('FIB', 7).differences.dynamicDelta, 8)
  );
  t('Helpers', 'HTML escaping', () => eq(esc('<b a="1">'), '&lt;b a=&quot;1&quot;&gt;'));
  t('Helpers', 'hasOwn helper', () => {
    eq(hasOwn({ a: 1 }, 'a'), true);
    eq(hasOwn({}, 'toString'), false);
  });
  return out;
}
