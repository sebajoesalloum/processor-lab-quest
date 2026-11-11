/* Regression tests restored from Processor Lab 2.1 (the 3.0 rewrite had dropped them),
   ported to import the engine modules directly instead of slicing the HTML. */
import test from 'node:test';
import assert from 'node:assert/strict';
import {run,WL,MODELS,asm,mk,step,stepBack} from '../src/engine.js';
import {encodeInstruction} from '../src/encoders.js';
import {customAssemble,customRun,CUSTOM_EXAMPLE} from '../src/custom-isa.js';
import {esc} from '../src/util.js';

const runToHalt = s => { let n = 0; while (!s.halt && n++ < 5000) step(s); return s; };

/* ---- x86 teaching-subset flag semantics ---- */
test('x86 signed overflow makes JGE take the correct path (OF set)', () => {
  const s = runToHalt(mk('x86', {mem:{0:-2147483648, 1:1}}, ['mov eax,[rdi]','cmp eax,[rdi+4]','jge skip','mov eax,[rdi+4]','skip: mov [rdi+12],eax']));
  assert.equal(s.m[3], 1);
  assert.equal(s.f.o, true);
});
test('x86 DEC preserves the carry flag', () => {
  const s = runToHalt(mk('x86', {mem:{}}, ['mov eax,0','sub eax,1','dec eax']));
  assert.equal(s.f.c, true);
});

/* ---- reversible state ---- */
test('step back restores registers, memory, PC and cycle count', () => {
  const s = mk('mips', WL[0]); s.recordHistory = true;
  step(s);
  const snap = {m:s.m.slice(), r:{...s.r}, pc:s.pc, cyc:s.c.cyc};
  step(s);
  assert.ok(stepBack(s));
  assert.deepEqual(s.m, snap.m);
  assert.deepEqual(s.r, snap.r);
  assert.equal(s.pc, snap.pc);
  assert.equal(s.c.cyc, snap.cyc);
});

/* ---- assembler validation (MIPS32) ---- */
for (const [name, src] of [
  ['unknown opcode',   ['wat a,b']],
  ['bad register',     ['lw $notareg,0($a0)']],
  ['missing label',    ['beq $t0,$t1,missing']],
  ['duplicate label',  ['foo: addu $t0,$t0,$t1','foo: addu $t0,$t0,$t1']],
  ['missing operand',  ['lw $t0']],
  ['misaligned address', ['lw $t0,2($a0)']],
]) test('MIPS32 assembler rejects ' + name, () => assert.throws(() => asm(MODELS.mips, src)));

test('MIPS32 assembler rejects RISC-V-only opcodes (auipc, blt)', () => {
  assert.throws(() => asm(MODELS.mips, ['auipc $t0,1']));
  assert.throws(() => asm(MODELS.mips, ['x: blt $t0,$t1,x']));
});
test('RV32I assembler rejects MIPS-only mnemonics (addu)', () => assert.throws(() => asm(MODELS.rv, ['addu t0,t1,t2'])));

/* ---- RV32I register aliases and immediate ranges ---- */
test('RV32I ABI aliases and xN names address the same register', () => {
  const s = mk('rv', WL[0]); step(s);
  assert.equal(s.r.x5, 7);
  assert.equal(s.r.t0, undefined);
});
test('RV32I signed 12-bit immediate range is enforced (addi)', () => {
  assert.throws(() => asm(MODELS.rv, ['addi t0,zero,2048']));
  assert.doesNotThrow(() => asm(MODELS.rv, ['addi t0,zero,2047']));
  assert.doesNotThrow(() => asm(MODELS.rv, ['addi t0,zero,-2048']));
});
test('RV32I store displacement range is enforced', () => assert.throws(() => asm(MODELS.rv, ['sw t0,2048(a0)'])));

/* ---- x86 operand validation ---- */
test('x86 immediate must fit a signed 32-bit value', () => assert.throws(() => asm(MODELS.x86, ['mov eax,2147483648'])));
test('x86 immediate destination is rejected', () => assert.throws(() => asm(MODELS.x86, ['mov 12,eax'])));

/* ---- cache key must include inputs ---- */
test('modified workload inputs never reuse a stale cached result', () => {
  const w = {...WL[0], mem:{0:4, 1:9}, ex:13};
  assert.equal(run('mips', w).got, 13);
  assert.equal(run('mips', WL[0]).got, 12);
});

/* ---- machine-code encoding vectors ---- */
const enc = (arch, line, pc = 0, prefix = []) => encodeInstruction(arch, asm(MODELS[arch], [...prefix, line])[prefix.length], pc).hex;
test('MIPS32 encodings match the architecture specification', () => {
  assert.equal(enc('mips', 'addu $t2,$t0,$t1'), '0x01095021');
  assert.equal(enc('mips', 'sw $t2,8($a0)'),    '0xAC8A0008');
  const p = asm(MODELS.mips, ['loop: addu $t0,$t0,$t1', 'beq $zero,$zero,loop']);
  assert.equal(encodeInstruction('mips', p[1], 1).hex, '0x1000FFFE');   // backward branch offset -2
});
test('RV32I encodings match the architecture specification', () => {
  assert.equal(enc('rv', 'add t2,t0,t1'), '0x006283B3');
  assert.equal(enc('rv', 'lw t0,0(a0)'),  '0x00052283');
  assert.equal(enc('rv', 'sw t2,8(a0)'),  '0x00752423');
  const p = asm(MODELS.rv, ['beq zero,zero,target', 'addi t0,zero,1', 'target: add t0,t0,t0']);
  assert.equal(encodeInstruction('rv', p[0], 0).hex, '0x00000463');     // forward branch, +8 bytes
});

/* ---- custom teaching ISA ---- */
test('custom ISA: addition program stores 12 in cell 3 and encodes to the chosen width', () => {
  const r = customRun(CUSTOM_EXAMPLE, 4, 32);
  assert.equal(r.mem[3], 12);
  assert.equal(r.trace.length, 5);
  assert.ok(customAssemble(CUSTOM_EXAMPLE, 4, 16).every(x => x.bits.length === 16));
});
test('custom ISA: SUB/JNZ loop terminates with 0 after 10 instructions', () => {
  const r = customRun('MOVI r0,3\nMOVI r1,1\nloop: SUB r0,r1\nJNZ r0,loop\nSTORE r0,3\nHALT', 4, 32);
  assert.equal(r.mem[3], 0);
  assert.equal(r.trace.length, 10);
});
test('custom ISA: invalid register and branch target are rejected', () => {
  assert.throws(() => customAssemble('MOVI r9,1\nHALT', 4, 16));
  assert.throws(() => customAssemble('JNZ r0,missing\nHALT', 4, 16));
});
test('custom ISA: data width is independent of instruction encoding width (8-bit wraparound, 24-bit word)', () => {
  const r = customRun('MOVI r0,127\nMOVI r1,1\nADD r0,r1\nSTORE r0,3\nHALT', 4, 8, 24);
  assert.equal(r.mem[3], -128);
  assert.equal(r.p[0].bits.length, 24);
});
test('custom ISA: MOVI immediate wider than the data width wraps (200 → -56 on 8-bit data)', () => {
  const r = customRun('MOVI r0,200\nSTORE r0,3\nHALT', 4, 8, 24);
  assert.equal(r.mem[3], -56);
  assert.equal(customRun('MOVI r0,40000\nSTORE r0,3\nHALT', 4, 16, 24).mem[3], 40000 - 65536);
});
test('custom ISA: SUB wraps at the data width (-128 - 1 → 127 on 8-bit data)', () => {
  const r = customRun('MOVI r0,-128\nMOVI r1,1\nSUB r0,r1\nSTORE r0,3\nHALT', 4, 8, 24);
  assert.equal(r.mem[3], 127);
});
test('custom ISA: runaway program hits the execution limit instead of hanging', () => {
  assert.throws(() => customRun('MOVI r0,1\nloop: JNZ r0,loop\nHALT', 4, 16), /limit/i);
});

/* ---- output escaping ---- */
test('esc neutralises HTML metacharacters and quotes', () => {
  assert.equal(esc('<img onerror="x">'), '&lt;img onerror=&quot;x&quot;&gt;');
  assert.equal(esc("it's & <b>"), 'it&#39;s &amp; &lt;b&gt;');
});
