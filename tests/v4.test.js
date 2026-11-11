/* Processor Lab 4.0: pipeline explanation, datapath values, set-associative cache, demo experiments.
   Every expected number below was calculated by hand (see comments), not copied from the program. */
import test from 'node:test';
import assert from 'node:assert/strict';
import { mk, step, WL, run } from '../src/engine.js';
import { explainPipeline, simulatePipeline } from '../src/pipeline.js';
import { describeInstruction, datapathPhases } from '../src/datapath.js';
import { simulateCache, simulateDirectMappedCache, cacheGeometry, splitAddress, cachePattern, parseAccessList } from '../src/cache.js';
import { demoIsaComparison, demoForwarding, demoCache } from '../src/demo.js';
import { customAssemble, customRun, customFormat } from '../src/custom-isa.js';

const exec = (arch, lines, mem = {}) => {
  const s = mk(arch, { mem }, lines);
  while (!s.halt) step(s);
  return s;
};
const FWD = ['lw t0,0(a0)', 'add t1,t0,t0', 'sub t2,t1,t0', 'lw t3,4(a0)', 'add t4,t3,t2', 'sw t4,12(a0)'];

/* ---------- pipeline ---------- */
test('pipeline: hand-calculated schedule with forwarding (12 cycles, 2 load-use stalls)', () => {
  // lw 1-5; add waits for lw MEM(4) -> EX5; sub EX6 (t1 via EX/MEM); lw EX7; add waits for lw MEM(8) -> EX9; sw EX10, WB12
  const s = exec('rv', FWD, { 0: 7, 1: 5 });
  const e = explainPipeline(s.tr, { arch: 'rv', forwarding: true, branchPenalty: 2 });
  assert.deepEqual(e.rows.map((r) => r.EX), [3, 5, 6, 7, 9, 10]);
  assert.equal(e.cycles, 12);
  assert.equal(e.dataStalls, 2);
  assert.equal(e.loadUseHazards, 2);
  const via = Object.fromEntries(e.operands.filter((o) => o.via !== 'register file').map((o) => [o.consumer + ':' + o.reg, o.via + '=' + o.delivered]));
  assert.equal(via['1:x5'], 'MEM/WB → EX=7');
  assert.equal(via['2:x6'], 'EX/MEM → EX=14');
  assert.equal(via['4:x28'], 'MEM/WB → EX=5');
  assert.equal(via['5:x29'], 'EX/MEM → EX=12');
  assert.equal(s.m[3], 12);
});
test('pipeline: same program without forwarding (18 cycles, 8 stalls = 4 dependencies x 2)', () => {
  // each adjacent dependency waits for WB: 2 stalls; add t4 depends on lw t3 (adjacent, 2) ; sub->add t4 is covered
  const s = exec('rv', FWD, { 0: 7, 1: 5 });
  const e = explainPipeline(s.tr, { arch: 'rv', forwarding: false, branchPenalty: 2 });
  assert.deepEqual(e.rows.map((r) => r.EX), [3, 6, 9, 10, 13, 16]);
  assert.equal(e.cycles, 18);
  assert.equal(e.dataStalls, 8);
  assert.equal(e.forwardedOperands, 0);
});
test('pipeline: forwarding on/off give identical final registers and every delivered operand matches the interpreter', () => {
  for (const arch of ['rv', 'mips'])
    for (const w of WL) {
      const s = mk(arch, w);
      while (!s.halt) step(s);
      for (const forwarding of [true, false])
        for (const branchPolicy of ['every', 'taken'])
          for (const branchPenalty of [0, 2, 3]) {
            const e = explainPipeline(s.tr, { arch, forwarding, branchPolicy, branchPenalty });
            assert.deepEqual(e.operandMismatches, [], `${arch} ${w.id} fwd=${forwarding} ${branchPolicy} ${branchPenalty}`);
            const p = simulatePipeline(s.tr.map((t) => ({ t: t.t, taken: t.branchTaken === true })), { arch, forwarding, branchPolicy, branchPenalty });
            assert.equal(e.cycles, p.cycles);
            // cycle identity: N + 4 fill + stalls + penalties (a trailing branch's penalty falls after the end)
            const last = e.rows[e.rows.length - 1];
            assert.equal(e.cycles, e.instructions + 4 + e.dataStalls + e.branchBubbles - (last.branch ? last.branchBubbles : 0));
          }
    }
});
test('pipeline: the operand check catches a schedule that would read a stale value (mutation)', () => {
  const s = exec('rv', FWD, { 0: 7, 1: 5 });
  // remove the load-use stall of instruction 2: its EX moves to cycle 4, when the loaded t0 does not exist yet
  const e = explainPipeline(s.tr, {
    arch: 'rv',
    forwarding: true,
    mutateSchedule: (rows) => {
      rows[1].EX = 4;
    },
  });
  assert.ok(e.operandMismatches.length >= 1);
  assert.equal(e.operandMismatches[0].consumer, 1);
  // without forwarding: reading the register file one cycle before the producer's write-back is stale
  const off = explainPipeline(s.tr, {
    arch: 'rv',
    forwarding: false,
    mutateSchedule: (rows) => {
      rows[1].EX = rows[0].WB; /* last ID cycle = WB - 1: value not written yet */
    },
  });
  assert.equal(off.operandMismatches[0]?.consumer, 1);
});
test('pipeline timeline: cycle 4 of a load-use pair shows a stall in ID, a bubble in EX and a held fetch', () => {
  const s = exec('rv', ['lw t0,0(a0)', 'add t1,t0,t0', 'lw t2,4(a0)'], { 0: 7, 1: 5 });
  const e = explainPipeline(s.tr, { arch: 'rv', forwarding: true });
  const c4 = e.timeline[3].slot;
  assert.deepEqual([c4.IF.row, c4.IF.state], [2, 'active']);
  assert.deepEqual([c4.ID.row, c4.ID.state], [1, 'stall']);
  assert.deepEqual([c4.EX.state, c4.EX.cause], ['bubble', 'stall']);
  assert.equal(c4.MEM.row, 0);
  assert.deepEqual([e.timeline[2].slot.IF.row, e.timeline[2].slot.IF.state], [2, 'hold']);
  assert.equal(e.timeline[4].forwards[0].resolvedBy, 'MEM/WB → EX');
});
test('pipeline timeline: branch penalty slots are bubbles (every) or flushes (taken), one IF slot per penalty cycle', () => {
  const prog = ['addi t0,zero,2', 'loop: addi t0,t0,-1', 'bne t0,zero,loop', 'sw t0,12(a0)'];
  const s = exec('rv', prog);
  for (const policy of ['every', 'taken']) {
    const e = explainPipeline(s.tr, { arch: 'rv', forwarding: true, branchPenalty: 2, branchPolicy: policy });
    const lost = e.timeline.filter((t) => t.slot.IF.row == null && t.slot.IF.cause === 'branch').length;
    // two dynamic bne: first taken, second not taken
    assert.equal(lost, policy === 'every' ? 4 : 2);
    if (policy === 'taken') assert.ok(e.timeline.some((t) => t.slot.IF.state === 'flush'));
    assert.equal(e.branchesTaken, 1);
  }
});
test('pipeline: five independent instructions take 9 cycles and report execution time at a clock', () => {
  const s = exec('rv', ['addi t0,zero,1', 'addi t1,zero,2', 'addi t2,zero,3', 'addi t3,zero,4', 'addi t4,zero,5']);
  const e = explainPipeline(s.tr, { arch: 'rv', clockMHz: 200 });
  assert.equal(e.cycles, 9);
  assert.equal(e.timeNs, 45);
  assert.equal(e.hazards.length, 0);
});

/* ---------- datapath ---------- */
test('datapath: arithmetic, register-register, load, store and branch values match the interpreter', () => {
  const s = mk('mips', WL.find((w) => w.id === 'ADD'));
  while (!s.halt) step(s);
  const d = s.tr.map((t) => describeInstruction('mips', t, s.p[t.pc]));
  assert.deepEqual([d[0].kind, d[0].mem.address, d[0].mem.value, d[0].write.value], ['load', 0, 7, 7]);
  assert.deepEqual([d[2].kind, d[2].alu.a, d[2].alu.b, d[2].alu.result, d[2].write.label], ['alu3', 7, 5, 12, '$t2 ($10)']);
  assert.deepEqual([d[3].kind, d[3].mem.address, d[3].mem.value, d[3].write], ['store', 12, 12, null]);
  assert.equal(d[2].encoding, '0x01095021');
  const ph = datapathPhases(d[2]);
  assert.equal(ph.length, 6);
  assert.match(ph[3].text, /7 \+ 5 = <b>12<\/b>/);
  assert.match(ph[5].wires.wbmux_regs, /← 12/);
  // immediate arithmetic and branch (RV32I SUMN: addi t0,t0,-1 and bne)
  const r = mk('rv', WL.find((w) => w.id === 'SUMN'));
  while (!r.halt) step(r);
  const ad = describeInstruction('rv', r.tr[2], r.p[r.tr[2].pc]);
  assert.deepEqual([ad.kind, ad.alu.a, ad.alu.b, ad.alu.result], ['alui', 5, -1, 4]);
  const br = describeInstruction('rv', r.tr[3], r.p[r.tr[3].pc]);
  assert.deepEqual([br.kind, br.branch.taken, br.branch.targetIndex, br.branch.offsetBytes], ['branch', true, 1, -8]);
  assert.match(datapathPhases(br)[4].text, /branch target/);
  const last = r.tr.filter((t) => /^bne/.test(t.t)).pop();
  assert.equal(describeInstruction('rv', last, r.p[last.pc]).branch.taken, false);
});
test('datapath: every executed instruction of every workload on all four models cross-checks', () => {
  for (const arch of ['sq', 'mips', 'rv', 'x86'])
    for (const w of WL) {
      const s = mk(arch, w);
      while (!s.halt) step(s);
      for (const t of s.tr) {
        const d = describeInstruction(arch, t, s.p[t.pc]);
        assert.ok(d.aluChecked, `${arch} ${w.id} ${t.t}`);
        assert.equal(datapathPhases(d).length, 6);
      }
    }
});
test('datapath: U-type, SUBLEQ and x86 memory operands', () => {
  const s = exec('rv', ['lui t0,1', 'auipc t1,1']);
  const lui = describeInstruction('rv', s.tr[0], s.p[0]),
    auipc = describeInstruction('rv', s.tr[1], s.p[1]);
  assert.equal(lui.write.value, 4096);
  assert.deepEqual([auipc.alu.a, auipc.alu.b, auipc.write.value], [4, 4096, 4100]);
  const q = exec('sq', ['SUBLEQ A,B,n'], { 0: 5, 1: 3 });
  const sq = describeInstruction('sq', q.tr[0], q.p[0]);
  assert.deepEqual([sq.subleq.va, sq.subleq.vb, sq.subleq.result, sq.subleq.taken], [5, 3, -2, true]);
  const x = mk('x86', WL.find((w) => w.id === 'ADD'));
  while (!x.halt) step(x);
  const add = describeInstruction('x86', x.tr[1], x.p[1]);
  assert.deepEqual([add.mem.address, add.mem.value, add.alu.result, add.write.value], [4, 5, 12, 12]);
});

/* ---------- cache ---------- */
test('cache: address split by hand (address 0x1234, 64 B, 16 B blocks, 2-way -> 2 sets)', () => {
  const g = cacheGeometry({ cacheSize: 64, blockSize: 16, associativity: 2 });
  assert.deepEqual([g.sets, g.offsetBits, g.indexBits, g.tagBits], [2, 4, 1, 11]);
  // block = 0x1234 / 16 = 291; index = 291 mod 2 = 1; tag = floor(291/2) = 145; offset = 4
  assert.deepEqual(splitAddress(0x1234, g), { address: 0x1234, block: 291, offset: 4, index: 1, tag: 145 });
});
test('cache: LRU vs FIFO on the replacement sequence (hand traced: LRU 5 hits, FIFO 3 hits)', () => {
  const seq = parseAccessList('0 32 0 64 0 32 0 64 0 32 0 64');
  const base = { cacheSize: 64, blockSize: 16, associativity: 2, hitTime: 1, missPenalty: 20 };
  const lru = simulateCache(seq, { ...base, policy: 'LRU' }),
    fifo = simulateCache(seq, { ...base, policy: 'FIFO' });
  assert.deepEqual(lru.trace.map((t) => +t.hit), [0, 0, 1, 0, 1, 0, 1, 0, 1, 0, 1, 0]);
  assert.deepEqual(fifo.trace.map((t) => +t.hit), [0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 1, 0]);
  assert.equal(lru.amat, 1 + (7 / 12) * 20);
  assert.equal(fifo.amat, 1 + (9 / 12) * 20);
  assert.equal(lru.trace[3].victim.block, 2); // 64 evicts block 2 (address 32), the least recently used
  assert.equal(fifo.trace[3].victim.block, 0); // FIFO evicts block 0, loaded first
});
test('cache: 3C classification (conflict pattern and capacity scan)', () => {
  const conflict = cachePattern('conflict', { words: 16, span: 64 });
  const dm = simulateCache(conflict, { cacheSize: 64, blockSize: 16, associativity: 1 });
  assert.deepEqual([dm.hits, dm.misses, dm.missBreakdown.compulsory, dm.missBreakdown.conflict], [0, 16, 2, 14]);
  const fa = simulateCache(conflict, { cacheSize: 64, blockSize: 16, associativity: 'full' });
  assert.deepEqual([fa.hits, fa.misses, fa.missBreakdown.conflict], [14, 2, 0]);
  // 96-byte array twice through a 64-byte direct-mapped cache: 6 compulsory + 4 capacity misses
  const scan = demoCache('scan').results[0];
  assert.deepEqual(scan.missBreakdown, { compulsory: 6, capacity: 4, conflict: 0 });
});
test('cache: write-back marks dirty and writes back once; write-through writes every store', () => {
  const seq = parseAccessList('w0 w4 w8 w12 w0 w4 w8 w12 w0 w4 w8 w12 r64 r80');
  const wb = simulateCache(seq, { cacheSize: 32, blockSize: 16, writePolicy: 'write-back' });
  const wt = simulateCache(seq, { cacheSize: 32, blockSize: 16, writePolicy: 'write-through' });
  assert.deepEqual([wb.hits, wb.misses, wb.writebacks, wb.memoryWrites], [11, 3, 1, 0]);
  assert.deepEqual([wt.hits, wt.misses, wt.writebacks, wt.memoryWrites], [11, 3, 0, 12]);
  assert.equal(wb.trace[12].victim.writeback, true);
  // a write MISS (allocated) must leave the line dirty: evicting it later costs one write-back
  const one = simulateCache(parseAccessList('w0 r64'), { cacheSize: 32, blockSize: 16, writePolicy: 'write-back' });
  assert.deepEqual([one.trace[0].setAfter[0].dirty, one.writebacks], [true, 1]);
  const nwa = simulateCache(parseAccessList('w0 r0'), { cacheSize: 32, blockSize: 16, writeAllocate: false });
  assert.deepEqual([nwa.trace[0].way, nwa.hits, nwa.misses], [-1, 0, 2]);
});
test('cache: seeded random replacement is reproducible; legacy direct-mapped API unchanged; invalid geometry rejected', () => {
  const seq = cachePattern('random', { words: 60, region: 64, seed: 3 });
  const cfg = { cacheSize: 64, blockSize: 16, associativity: 4, policy: 'RANDOM', seed: 99 };
  assert.deepEqual(simulateCache(seq, cfg).trace.map((t) => t.hit), simulateCache(seq, cfg).trace.map((t) => t.hit));
  const old = simulateDirectMappedCache([0, 4, 16, 0].map((address) => ({ address })), { cacheSize: 64, blockSize: 16 });
  assert.deepEqual([old.hits, old.misses, old.amat], [2, 2, 11]);
  assert.throws(() => simulateCache([], { cacheSize: 64, blockSize: 16, associativity: 8 }), /Associativity/);
  assert.throws(() => simulateCache([], { cacheSize: 64, blockSize: 2 }), /4-byte/);
  assert.throws(() => simulateCache([], { policy: 'MRU' }), /Replacement policy/);
  assert.throws(() => parseAccessList('0 x9'), /Cannot read/);
});
test('cache: every workload trace replays under every configuration with consistent statistics', () => {
  for (const arch of ['sq', 'mips', 'rv', 'x86'])
    for (const w of WL) {
      const acc = run(arch, w).accesses;
      for (const associativity of [1, 2, 'full'])
        for (const policy of ['LRU', 'FIFO', 'RANDOM']) {
          const c = simulateCache(acc, { cacheSize: 64, blockSize: 16, associativity, policy });
          assert.equal(c.hits + c.misses, acc.length);
          const b = c.missBreakdown;
          assert.equal(b.compulsory + b.capacity + b.conflict, c.misses);
        }
    }
});

/* ---------- demonstration experiments ---------- */
test('demo 1: MIPS32 vs RV32I Fibonacci(7) is reproducible and explained by slt vs bge', () => {
  const a = demoIsaComparison('FIB', 7),
    b = demoIsaComparison('FIB', 7);
  assert.equal(JSON.stringify(a.runs.rv.histogram), JSON.stringify(b.runs.rv.histogram));
  assert.ok(a.runs.mips.ok && a.runs.rv.ok);
  // loop test runs n+1 = 8 times: MIPS needs slt + beq, RV32I one bge -> 8 more MIPS instructions
  assert.equal(a.differences.dynamicDelta, 8);
  assert.deepEqual(a.differences.mipsOnly, [['slt', 8]]);
  assert.deepEqual(a.differences.rvOnly, [['bge', 8]]);
  assert.equal(a.runs.mips.pipeMismatches + a.runs.rv.pipeMismatches, 0);
  assert.equal(a.encodings.find((e) => e.label === 'Load word').rv.hex, '0x00052283');
  assert.throws(() => demoIsaComparison('FIB', 16), /0 to 15/);
});
test('demo 2: forwarding experiment saves 6 cycles (18 -> 12)', () => {
  const r = demoForwarding();
  assert.deepEqual([r.A.cycles, r.B.cycles, r.saved, r.ok, r.sameRegisters], [18, 12, 6, true, true]);
  assert.equal(r.speedup, 1.5);
});
test('demo 3: interleaved arrays thrash a direct-mapped cache; 2-way or double size fix it', () => {
  const r = demoCache('interleaved');
  assert.deepEqual(r.results.map((x) => [x.hits, x.misses]), [[0, 32], [28, 4], [28, 4]]);
  assert.deepEqual(r.results.map((x) => x.amat), [21, 3.5, 3.5]);
});

/* ---------- engine and custom ISA additions ---------- */
test('engine trace records access values and memory before/after', () => {
  const s = mk('rv', WL.find((w) => w.id === 'ADD'));
  while (!s.halt) step(s);
  assert.deepEqual(s.tr[0].accesses, [{ type: 'read', address: 0, cell: 0, value: 7 }]);
  assert.deepEqual([s.tr[3].memoryBefore[3], s.tr[3].memoryAfter[3]], [0, 12]);
});
test('custom ISA: clear errors for undefined labels, non-numbers and impossible formats', () => {
  assert.throws(() => customAssemble('JNZ r0,nowhere\nHALT'), /undefined label nowhere/);
  assert.throws(() => customAssemble('MOVI r0,abc\nHALT'), /not a whole number/);
  assert.throws(() => customFormat(16, 12), /immediate bit/); // 12 - 3 - 2x4 = 1 bit
  assert.equal(customFormat(8, 16).immBits, 7);
  const p = customAssemble('MOVI r1,3\nloop: SUB r1,r2\nJNZ r1,loop\nHALT', 4, 16);
  assert.equal(p[2].meaning, 'if r1 ≠ 0 then PC ← 1');
  assert.deepEqual(p[0].fields, ['000', '01', '00', '000000011']);
  assert.equal(customRun('MOVI r0,7\nMOVI r1,5\nADD r0,r1\nSTORE r0,3\nHALT').mem[3], 12);
});
