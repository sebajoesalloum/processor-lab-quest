/* Independent encoding cross-check.
   Assembles the same MIPS32 / RV32I source with GNU binutils and compares every 32-bit
   word against the project's own encoder (src/encoders.js).
   Requires: riscv64-linux-gnu-as/objcopy and mips-linux-gnu-as/objcopy (Ubuntu packages
   binutils-riscv64-linux-gnu and binutils-mips-linux-gnu). Without them the check is skipped. */
import { execFileSync, spawnSync } from 'node:child_process';
import { mkdtempSync, writeFileSync, readFileSync, rmSync, writeFileSync as wf } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { asm, MODELS, PROG, RV_ALIAS } from '../src/engine.js';
import { encodeInstruction, MIPS_REG } from '../src/encoders.js';

const TOOLS = {
  rv: { as: 'riscv64-linux-gnu-as', objcopy: 'riscv64-linux-gnu-objcopy', flags: ['-march=rv32i', '-mabi=ilp32', '-mno-relax'], le: true, head: '' },
  mips: { as: 'mips-linux-gnu-as', objcopy: 'mips-linux-gnu-objcopy', flags: ['-mips32', '-EB'], le: false, head: '.set noreorder\n.set noat\n' },
};

export const toolchainAvailable = () =>
  Object.values(TOOLS).every((t) => [t.as, t.objcopy].every((b) => spawnSync(b, ['--version']).status === 0));

function gnuWords(arch, lines) {
  const t = TOOLS[arch];
  const dir = mkdtempSync(join(tmpdir(), 'xcheck-'));
  try {
    writeFileSync(join(dir, 'p.s'), t.head + '.text\n' + lines.join('\n') + '\n');
    execFileSync(t.as, [...t.flags, '-o', join(dir, 'p.o'), join(dir, 'p.s')], { stdio: 'pipe' });
    execFileSync(t.objcopy, ['-O', 'binary', '-j', '.text', join(dir, 'p.o'), join(dir, 'p.bin')]);
    const b = readFileSync(join(dir, 'p.bin'));
    const out = [];
    for (let i = 0; i < b.length; i += 4) out.push(t.le ? b.readUInt32LE(i) : b.readUInt32BE(i));
    return out;
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

/* Compare one program. Returns {words, mismatches[]}. */
export function checkProgram(arch, name, lines) {
  const prog = asm(MODELS[arch], lines);
  const ours = prog.map((ins, pc) => encodeInstruction(arch, ins, pc).hex).map((h) => parseInt(h.slice(2), 16) >>> 0);
  const gnu = gnuWords(arch, lines);
  const mismatches = [];
  if (gnu.length < ours.length) mismatches.push(`${name}: GNU produced ${gnu.length} words, project ${ours.length}`);
  /* GNU pads .text to an alignment boundary (MIPS: 16 bytes); anything extra must be zero padding */
  if (gnu.slice(ours.length).some((w) => w !== 0)) mismatches.push(`${name}: GNU emitted extra non-padding words (pseudo-instruction expansion?)`);
  for (let i = 0; i < Math.min(ours.length, gnu.length); i++)
    if (ours[i] !== gnu[i])
      mismatches.push(`${name}[${i}] "${prog[i].t}": project 0x${ours[i].toString(16).padStart(8, '0')} vs GNU 0x${gnu[i].toString(16).padStart(8, '0')}`);
  return { words: ours.length, mismatches };
}


const rvReg = (i) => (i % 5 === 4 ? 'x' + (i % 32) : Object.entries(RV_ALIAS).find(([, v]) => v === i % 32)[0]);
const mipsNames = Object.keys(MIPS_REG);
const mReg = (i) => '$' + mipsNames.find((n) => MIPS_REG[n] === i % 32);
const NOP = { rv: 'add zero,zero,zero', mips: 'addu $zero,$zero,$zero' };

/* Edge-case cases: every register in every operand slot, boundary immediates and offsets,
   forward/backward branches including the exact RV32I B-type limits. Each case is a small
   program (the project assembler caps programs at 2000 instructions). */
export function cases() {
  const out = [];
  const imm12 = [-2048, -2047, -1, 0, 1, 2046, 2047];
  const imm16 = [-32768, -32767, -1, 0, 1, 32766, 32767];
  /* the teaching assembler requires word-aligned lw/sw displacements, so memory offsets use aligned extremes */
  const off12 = [-2048, -2044, -4, 0, 4, 2040, 2044];
  const off16 = [-32768, -32764, -4, 0, 4, 32760, 32764];
  for (const [arch, R, rops, name] of [
    ['rv', rvReg, ['add', 'sub', 'slt'], 'R-type all registers'],
    ['mips', mReg, ['addu', 'subu', 'slt'], 'R-type all registers'],
  ]) {
    const lines = [];
    for (let i = 0; i < 32; i++) for (const op of rops) lines.push(`${op} ${R(i)},${R(i + 7)},${R(i + 19)}`);
    out.push({ arch, name, lines });
  }
  out.push({
    arch: 'rv',
    name: 'I/S-type boundary immediates',
    lines: imm12.flatMap((v, k) => [
      `addi ${rvReg(k + 3)},${rvReg(k + 11)},${v}`,
      `lw ${rvReg(k + 5)},${off12[k]}(${rvReg(k + 9)})`,
      `sw ${rvReg(k + 6)},${off12[k]}(${rvReg(k + 13)})`,
    ]),
  });
  out.push({
    arch: 'mips',
    name: 'I-type boundary immediates',
    lines: imm16.flatMap((v, k) => [
      `addiu ${mReg(k + 3)},${mReg(k + 11)},${v}`,
      `lw ${mReg(k + 5)},${off16[k]}(${mReg(k + 9)})`,
      `sw ${mReg(k + 6)},${off16[k]}(${mReg(k + 13)})`,
    ]),
  });
  out.push({
    arch: 'rv',
    name: 'U-type boundary immediates',
    lines: [0, 1, 0x7ffff, 0x80000, 0xfffff].flatMap((v) => [`lui ${rvReg(v + 1)},${v}`, `auipc ${rvReg(v + 2)},${v}`]),
  });
  const pad = (arch, n) => Array(n).fill(NOP[arch]);
  for (const [arch, ops, R, dists] of [
    ['rv', ['beq', 'bne', 'blt', 'bge'], rvReg, [0, 1, 2, 7, 100, 1000]],
    ['mips', ['beq', 'bne'], mReg, [0, 1, 2, 7, 100, 1500]],
  ])
    ops.forEach((op, k) => {
      for (const d of dists) {
        out.push({ arch, name: `${op} backward over ${d}`, lines: ['top:', ...pad(arch, d), `${op} ${R(k + 3)},${R(k + 20)},top`] });
        out.push({ arch, name: `${op} forward over ${d}`, lines: [`${op} ${R(k + 8)},${R(k + 25)},end`, ...pad(arch, d), `end: ${NOP[arch]}`] });
      }
      if (arch === 'rv') {
        /* exact B-type limits: -4096 bytes back (1024 instructions) and +4094 -> 4092 forward */
        out.push({ arch, name: `${op} backward at exact -4096 limit`, lines: ['top:', ...pad(arch, 1024), `${op} t0,t1,top`] });
        out.push({ arch, name: `${op} forward at +4092 (largest word-aligned)`, lines: [`${op} t0,t1,end`, ...pad(arch, 1022), `end: ${NOP[arch]}`] });
      }
    });
  return out;
}

/* Out-of-range RV32I branches must be rejected by BOTH the project and GNU as. */
export function rejectionAgreement() {
  const res = [];
  for (const [name, lines] of [
    ['bge one word past -4096', ['top:', ...Array(1025).fill(NOP.rv), 'bge t0,t1,top']],
    ['beq forward past +4094', ['beq t0,t1,end', ...Array(1023).fill(NOP.rv), `end: ${NOP.rv}`]],
  ]) {
    let ours = false, gnu = false;
    try {
      const p = asm(MODELS.rv, lines);
      p.forEach((ins, pc) => encodeInstruction('rv', ins, pc));
    } catch { ours = true; }
    try {
      const nInstr = lines.filter((l) => l.replace(/^\s*\w+:\s*/, '').trim()).length;
      /* RISC-V gas never errors here: it relaxes an out-of-range branch to inverted-branch + jal (more words) */
      gnu = gnuWords('rv', lines).length > nInstr;
    } catch { gnu = true; }
    res.push({ name, ours, gnu });
  }
  return res;
}

export function runCrosscheck() {
  const results = [];
  for (const arch of ['rv', 'mips'])
    for (const [k, v] of Object.entries(PROG)) results.push({ arch, name: `workload ${k}`, ...checkProgram(arch, `workload ${k}`, v[arch]) });
  for (const c of cases()) results.push({ arch: c.arch, name: c.name, ...checkProgram(c.arch, c.name, c.lines) });
  return results;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  if (!toolchainAvailable()) {
    console.log('SKIPPED: GNU binutils for riscv64 and mips not installed.');
    process.exit(0);
  }
  const results = runCrosscheck();
  let words = 0, bad = 0;
  const lines = [];
  for (const r of results) {
    words += r.words;
    bad += r.mismatches.length;
    if (r.mismatches.length) lines.push(`FAIL ${r.arch.padEnd(4)} ${r.name} (${r.words} words)`);
    for (const x of r.mismatches.slice(0, 10)) lines.push('     ' + x);
  }
  lines.push(`${results.length} programs assembled by both the project and GNU as; ${results.filter((r) => !r.mismatches.length).length} identical.`);
  for (const r of rejectionAgreement()) {
    const ok = r.ours && r.gnu;
    if (!ok) bad++;
    lines.push(`${ok ? 'PASS' : 'FAIL'} out-of-range agreement: ${r.name} (project ${r.ours ? 'rejects' : 'accepts'}; GNU ${r.gnu ? 'cannot emit a single B-type branch' : 'emits one B-type word'})`);
  }
  const ver = (b) => execFileSync(b, ['--version']).toString().split('\n')[0];
  lines.push('', `Reference: ${ver(TOOLS.rv.as)}`, `Reference: ${ver(TOOLS.mips.as)}`);
  lines.push(`Compared ${words} encoded 32-bit words; ${bad} mismatches.`);
  console.log(lines.join('\n'));
  wf(new URL('../crosscheck-results.txt', import.meta.url), lines.join('\n') + '\n');
  process.exit(bad ? 1 : 0);
}
