/* Pipeline decoder strictness and branch-penalty policy tests (hand-calculated). */
import test from 'node:test';
import assert from 'node:assert/strict';
import {WL,MODELS,asm,mk,step} from '../src/engine.js';
import {simulatePipeline,pipelineOpcodes,traceToPipelineInput,PIPELINE_SUPPORTED_ARCHS} from '../src/pipeline.js';

const trace = (arch, w) => { const s = mk(arch, w); let n = 0; while (!s.halt && n++ < 5000) step(s); return s.tr; };

/* ---------- 1. The decoder fails loudly ---------- */
test('unknown RV32I opcode throws instead of silently having no dependencies', () => {
  for (const bad of ['and t0,t1,t2', 'jal ra,loop', 'sll t0,t1,2', 'xori t0,t1,1'])
    assert.throws(() => simulatePipeline([bad], {arch:'rv'}), /unsupported rv opcode/);
});
test('MIPS-only decoder rejects opcodes the MIPS assembler also rejects (auipc, lui, blt, bge)', () => {
  for (const bad of ['auipc $t0,1', 'lui $t0,1', 'blt $t0,$t1,x', 'bge $t0,$t1,x'])
    assert.throws(() => simulatePipeline([bad], {arch:'mips'}), /unsupported mips opcode/);
});
test('error message names the opcode and the instruction', () => {
  assert.throws(() => simulatePipeline(['mul t0,t1,t2'], {arch:'rv'}), err => /"mul"/.test(err.message) && /mul t0,t1,t2/.test(err.message));
});
test('unsupported ISAs (x86, SUBLEQ) are refused rather than given CPI 1', () => {
  assert.deepEqual(PIPELINE_SUPPORTED_ARCHS.sort(), ['mips', 'rv']);
  for (const arch of ['x86', 'sq', 'arm']) assert.throws(() => simulatePipeline(['add t0,t1,t2'], {arch}), /supports only/);
  assert.throws(() => pipelineOpcodes('x86'), /supports only/);
});
test('wrong operand counts and unparseable lines throw', () => {
  assert.throws(() => simulatePipeline(['add t0,t1'], {arch:'rv'}), /needs 3 operands/);
  assert.throws(() => simulatePipeline(['lw t0'], {arch:'rv'}), /needs 2 operands/);
  assert.throws(() => simulatePipeline(['add t0,,t2'], {arch:'rv'}), /operands/);
  assert.throws(() => simulatePipeline(['123'], {arch:'rv'}), /cannot parse/);
});
test('decoder opcode tables match what each assembler accepts (no drift)', () => {
  const probes = {
    mips: {lw:'lw $t0,0($a0)', sw:'sw $t0,0($a0)', addu:'addu $t0,$t1,$t2', subu:'subu $t0,$t1,$t2', addiu:'addiu $t0,$t1,1', slt:'slt $t0,$t1,$t2', beq:'x: beq $t0,$t1,x', bne:'x: bne $t0,$t1,x', blt:'x: blt $t0,$t1,x', bge:'x: bge $t0,$t1,x', lui:'lui $t0,1', auipc:'auipc $t0,1', add:'add $t0,$t1,$t2', addi:'addi $t0,$t1,1', sub:'sub $t0,$t1,$t2'},
    rv:   {lw:'lw t0,0(a0)', sw:'sw t0,0(a0)', add:'add t0,t1,t2', sub:'sub t0,t1,t2', addi:'addi t0,t1,1', slt:'slt t0,t1,t2', beq:'x: beq t0,t1,x', bne:'x: bne t0,t1,x', blt:'x: blt t0,t1,x', bge:'x: bge t0,t1,x', lui:'lui t0,1', auipc:'auipc t0,1', addu:'addu t0,t1,t2', subu:'subu t0,t1,t2', addiu:'addiu t0,t1,1'},
  };
  for (const arch of ['mips', 'rv']) {
    const decoder = new Set(pipelineOpcodes(arch));
    for (const [op, line] of Object.entries(probes[arch])) {
      let accepted = true; try { asm(MODELS[arch], [line]); } catch { accepted = false; }
      assert.equal(decoder.has(op), accepted, `${arch} ${op}: assembler accepts=${accepted}, pipeline decoder lists=${decoder.has(op)}`);
    }
  }
});
test('every dynamic instruction of all 12 workloads is understood by the decoder (both ISAs, both policies)', () => {
  for (const arch of ['mips', 'rv']) for (const w of WL) for (const branchPolicy of ['every', 'taken']) {
    const r = simulatePipeline(traceToPipelineInput(trace(arch, w)), {arch, branchPolicy, branchPenalty:2});
    assert.ok(r.cycles >= r.instructions + 4, `${arch} ${w.id}`);
  }
});

/* ---------- 2. Branch penalty policy ---------- */
// i1 beq (not taken) | i2 addi | i3 bne (taken) | i4 addi — no data dependencies between them.
const seq = [{t:'beq t1,t2,x', taken:false}, 'addi t3,t3,1', {t:'bne t4,t5,x', taken:true}, 'addi t6,t6,1'];
test('hand-calculated: penalty 0 → 4 instructions fill/drain in 8 cycles', () => {
  const r = simulatePipeline(seq, {arch:'rv', branchPenalty:0});
  assert.equal(r.cycles, 8); assert.equal(r.dataStalls, 0); assert.equal(r.branchBubbles, 0);
});
test('hand-calculated: penalty 3, EVERY branch → IF at 1,5,6,10 → 14 cycles, 6 bubbles', () => {
  const r = simulatePipeline(seq, {arch:'rv', branchPenalty:3, branchPolicy:'every'});
  assert.deepEqual(r.rows.map(x => x.IF), [1, 5, 6, 10]);
  assert.equal(r.cycles, 14); assert.equal(r.branchBubbles, 6);
});
test('hand-calculated: penalty 3, TAKEN only → IF at 1,2,3,7 → 11 cycles, 3 bubbles', () => {
  const r = simulatePipeline(seq, {arch:'rv', branchPenalty:3, branchPolicy:'taken'});
  assert.deepEqual(r.rows.map(x => x.IF), [1, 2, 3, 7]);
  assert.equal(r.cycles, 11); assert.equal(r.branchBubbles, 3);
  assert.equal(r.branchesExecuted, 2); assert.equal(r.branchesTaken, 1);
  assert.equal(r.rows[0].branchBubbles, 0); assert.equal(r.rows[2].branchBubbles, 3);
});
test('default policy stays "every" so existing numbers do not change', () => {
  const d = simulatePipeline(seq, {arch:'rv', branchPenalty:3});
  assert.equal(d.branchPolicy, 'every'); assert.equal(d.cycles, 14);
});
test('policy "taken" refuses plain strings (it cannot guess branch outcomes)', () => {
  assert.throws(() => simulatePipeline(['beq t1,t2,x'], {arch:'rv', branchPolicy:'taken'}), /needs a \{t, taken\}/);
  assert.doesNotThrow(() => simulatePipeline(['addi t1,t1,1'], {arch:'rv', branchPolicy:'taken'}));   // no branch → no outcome needed
});
test('unknown policy is rejected', () => assert.throws(() => simulatePipeline(['addi t1,t1,1'], {arch:'rv', branchPolicy:'sometimes'}), /branchPolicy/));
test('taken-only never costs more than every-branch on real workloads, and bubbles = penalty × taken', () => {
  for (const arch of ['mips', 'rv']) for (const w of WL) {
    const input = traceToPipelineInput(trace(arch, w));
    const every = simulatePipeline(input, {arch, branchPenalty:3, branchPolicy:'every'});
    const taken = simulatePipeline(input, {arch, branchPenalty:3, branchPolicy:'taken'});
    assert.ok(taken.cycles <= every.cycles, `${arch} ${w.id}`);
    assert.equal(taken.branchBubbles, 3 * taken.branchesTaken);
    assert.equal(every.branchBubbles, 3 * every.branchesExecuted);
    assert.equal(taken.branchesTaken, every.branchesTaken);
  }
});
test('traceToPipelineInput reads the interpreter\'s own branch outcomes (RV32I MAX)', () => {
  // MAXa (A>=B): blt not taken, then beq-to-done TAKEN  → 2 executed, 1 taken.
  // MAXb (B>A):  blt TAKEN straight to the replace label → 1 executed, 1 taken.
  const a = WL.find(w => w.id === 'MAXa'), b = WL.find(w => w.id === 'MAXb');
  const ta = simulatePipeline(traceToPipelineInput(trace('rv', a)), {arch:'rv', branchPolicy:'taken', branchPenalty:2});
  const tb = simulatePipeline(traceToPipelineInput(trace('rv', b)), {arch:'rv', branchPolicy:'taken', branchPenalty:2});
  assert.deepEqual([ta.branchesExecuted, ta.branchesTaken], [2, 1]);
  assert.deepEqual([tb.branchesExecuted, tb.branchesTaken], [1, 1]);
  const ea = simulatePipeline(traceToPipelineInput(trace('rv', a)), {arch:'rv', branchPolicy:'every', branchPenalty:2});
  assert.equal(ea.branchBubbles, 4); assert.equal(ta.branchBubbles, 2);   // the not-taken blt no longer pays
});
test('FIB loop: taken branches counted from the trace match the interpreter notes', () => {
  const t = trace('rv', WL.find(w => w.id === 'FIB'));
  const expectedTaken = t.filter(x => x.k === 'branch' && /^branch TAKEN/.test(x.note)).length;
  const r = simulatePipeline(traceToPipelineInput(t), {arch:'rv', branchPolicy:'taken', branchPenalty:2});
  assert.equal(r.branchesTaken, expectedTaken); assert.ok(expectedTaken > 0);
});

/* ---------- 3. Zero register never carries a dependency ---------- */
test('writing x0/$zero creates no RAW hazard (forwarding off)', () => {
  assert.equal(simulatePipeline(['add zero,t1,t2', 'add t3,zero,t4'], {arch:'rv', forwarding:false, branchPenalty:0}).dataStalls, 0);
  assert.equal(simulatePipeline(['addu $zero,$t1,$t2', 'addu $t3,$zero,$t4'], {arch:'mips', forwarding:false, branchPenalty:0}).dataStalls, 0);
});
test('a real dependency still stalls (forwarding off: 2 bubbles; on: 0)', () => {
  const s = ['add t0,t1,t2', 'add t3,t0,t4'];
  assert.equal(simulatePipeline(s, {arch:'rv', forwarding:false, branchPenalty:0}).dataStalls, 2);
  assert.equal(simulatePipeline(s, {arch:'rv', forwarding:true, branchPenalty:0}).dataStalls, 0);
});
