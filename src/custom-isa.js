import { hasOwn } from './util.js';
/* Custom teaching ISA: a deliberately constrained, executable seven-opcode instruction set.
   Kept in its own module so it can be unit-tested without a DOM. */
export const CUSTOM_OPS = { MOVI: 0, ADD: 1, SUB: 2, LOAD: 3, STORE: 4, JNZ: 5, HALT: 6 };
export const CUSTOM_EXAMPLE = 'MOVI r0,7\nMOVI r1,5\nADD r0,r1\nSTORE r0,3\nHALT';
export const CUSTOM_MEANING = {
  MOVI: (a, b, imm) => `r${a} ← ${imm}`,
  ADD: (a, b) => `r${a} ← r${a} + r${b}`,
  SUB: (a, b) => `r${a} ← r${a} − r${b}`,
  LOAD: (a, b, imm) => `r${a} ← MEM[${imm}]`,
  STORE: (a, b, imm) => `MEM[${imm}] ← r${a}`,
  JNZ: (a, b, imm) => `if r${a} ≠ 0 then PC ← ${imm}`,
  HALT: () => 'stop',
};
export function customFormat(regCount = 4, width = 16) {
  if (![2, 4, 8, 16].includes(Number(regCount))) throw Error('Register count must be 2, 4, 8 or 16');
  if (!Number.isInteger(Number(width)) || width < 8 || width > 32) throw Error('Instruction width must be 8 to 32 bits');
  const regBits = Math.ceil(Math.log2(regCount)),
    immBits = width - 3 - 2 * regBits;
  if (immBits < 4)
    throw Error(
      `A ${width}-bit instruction with ${regCount} registers leaves only ${immBits} immediate bit(s) (3 opcode + 2 × ${regBits} register bits); at least 4 are needed to address the 16 memory cells. Use a wider instruction or fewer registers.`
    );
  return { regBits, immBits, opBits: 3 };
}
export function customAssemble(src, regCount = 4, width = 16) {
  const { regBits, immBits } = customFormat(regCount, width);
  const lines = [],
    labels = Object.create(null);
  for (const [idx, raw] of String(src).split(/\r?\n/).entries()) {
    let l = raw.replace(/(?:#|;|\/\/).*$/, '').trim();
    if (!l) continue;
    while (true) {
      const m = l.match(/^([A-Za-z_]\w*):\s*(.*)$/);
      if (!m) break;
      if (hasOwn(labels, m[1])) throw Error('Line ' + (idx + 1) + ': duplicate label');
      labels[m[1]] = lines.length;
      l = m[2].trim();
      if (!l) break;
    }
    if (l) lines.push({ l, line: idx + 1 });
  }
  if (!lines.length) throw Error('Enter a program');
  if (lines.length > 128) throw Error('Maximum 128 instructions');
  return lines.map(({ l, line }, pc) => {
    const m = l.match(/^([A-Za-z]+)\s*(.*)$/);
    if (!m) throw Error('Line ' + line + ': invalid syntax');
    const op = m[1].toUpperCase(),
      args = m[2] ? m[2].split(',').map((x) => x.trim()) : [];
    if (!hasOwn(CUSTOM_OPS, op)) throw Error('Line ' + line + ': unknown opcode ' + op);
    const count = op === 'HALT' ? 0 : ['ADD', 'SUB', 'MOVI', 'LOAD', 'STORE', 'JNZ'].includes(op) ? 2 : -1;
    if (args.length !== count || args.some((a) => !a))
      throw Error('Line ' + line + ': incorrect operands for ' + op);
    let a = 0,
      b = 0,
      imm = 0;
    const reg = (x) => {
      const m = x.match(/^r(\d+)$/i);
      if (!m || +m[1] >= regCount) throw Error('Line ' + line + ': invalid register ' + x);
      return +m[1];
    };
    if (count) {
      a = reg(args[0]);
      if (op === 'ADD' || op === 'SUB') b = reg(args[1]);
      else {
        if (op === 'JNZ' && /^[A-Za-z_]\w*$/.test(args[1]) && !hasOwn(labels, args[1]))
          throw Error('Line ' + line + ': undefined label ' + args[1]);
        if (!(op === 'JNZ' && hasOwn(labels, args[1])) && !/^-?\d+$/.test(args[1]))
          throw Error('Line ' + line + ': "' + args[1] + '" is not a whole number' + (op === 'JNZ' ? ' or a label' : ''));
        imm = op === 'JNZ' && hasOwn(labels, args[1]) ? labels[args[1]] : Number(args[1]);
        if (!Number.isSafeInteger(imm) || imm < -(2 ** (immBits - 1)) || imm >= 2 ** (immBits - 1))
          throw Error('Line ' + line + ': immediate/target outside ' + immBits + '-bit signed range');
        if (['LOAD', 'STORE'].includes(op) && (imm < 0 || imm >= 16))
          throw Error('Line ' + line + ': memory cell must be 0–15');
        if (op === 'JNZ' && (imm < 0 || imm >= lines.length))
          throw Error('Line ' + line + ': branch target outside program');
      }
    }
    const bits =
      CUSTOM_OPS[op].toString(2).padStart(3, '0') +
      a.toString(2).padStart(regBits, '0') +
      b.toString(2).padStart(regBits, '0') +
      (imm & (2 ** immBits - 1)).toString(2).padStart(immBits, '0');
    return { op, args, a, b, imm, bits, pc, line, fields: [bits.slice(0, 3), bits.slice(3, 3 + regBits), bits.slice(3 + regBits, 3 + 2 * regBits), bits.slice(3 + 2 * regBits)], meaning: CUSTOM_MEANING[op](a, b, imm) };
  });
}
export function customRun(src, regCount = 4, width = 16, instructionWidth = 16) {
  const p = customAssemble(src, regCount, instructionWidth),
    mask = width === 32 ? 0xffffffff : 2 ** width - 1,
    sign = width === 32 ? 0x80000000 : 2 ** (width - 1),
    norm = (v) => {
      const u = (v & mask) >>> 0;
      return u >= sign ? u - 2 * sign : u;
    };
  const r = Array(regCount).fill(0),
    mem = Array(16).fill(0),
    trace = [];
  let pc = 0,
    halt = false;
  for (let i = 0; i < 1000 && !halt; i++) {
    if (pc < 0 || pc >= p.length) throw Error('PC left the program without HALT');
    const ins = p[pc],
      before = pc;
    pc++;
    const { op, a, b, imm } = ins;
    switch (op) {
      case 'MOVI':
        r[a] = norm(imm);
        break;
      case 'ADD':
        r[a] = norm(r[a] + r[b]);
        break;
      case 'SUB':
        r[a] = norm(r[a] - r[b]);
        break;
      case 'LOAD':
        r[a] = mem[imm];
        break;
      case 'STORE':
        mem[imm] = r[a];
        break;
      case 'JNZ':
        if (r[a] !== 0) pc = imm;
        break;
      case 'HALT':
        halt = true;
        break;
    }
    trace.push({
      pc: before,
      assembly: op + ' ' + ins.args.join(','),
      bits: ins.bits,
      registers: r.slice(),
      memory: mem.slice(),
      nextPC: pc,
    });
  }
  if (!halt) throw Error('Execution limit (1000 instructions) reached');
  return { p, r, mem, trace, cycles: trace.length, wordWidth: width, regCount };
}
