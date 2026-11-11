import { hasOwn } from './util.js';
import { NAMES, nr, RV_ALIAS, ea } from './engine.js';

/* Verified fixed-width encodings for the implemented MIPS32 and RV32I subsets.
   Branch targets in the teaching interpreter are instruction indices; these
   encoders convert them to architecture-defined PC-relative byte offsets. */
const MIPS_REG = {
  zero: 0,
  at: 1,
  v0: 2,
  v1: 3,
  a0: 4,
  a1: 5,
  a2: 6,
  a3: 7,
  t0: 8,
  t1: 9,
  t2: 10,
  t3: 11,
  t4: 12,
  t5: 13,
  t6: 14,
  t7: 15,
  s0: 16,
  s1: 17,
  s2: 18,
  s3: 19,
  s4: 20,
  s5: 21,
  s6: 22,
  s7: 23,
  t8: 24,
  t9: 25,
  k0: 26,
  k1: 27,
  gp: 28,
  sp: 29,
  fp: 30,
  ra: 31,
};
const regNum = (id, name) => {
  const n = nr(name);
  if (id === 'mips') {
    if (!hasOwn(MIPS_REG, n)) throw Error('Invalid MIPS register ' + name);
    return MIPS_REG[n];
  }
  if (id === 'rv') {
    const i = RV_ALIAS[n] ?? (/^x(?:[12]?\d|3[01])$/.test(n) ? Number(n.slice(1)) : NaN);
    if (!Number.isInteger(i) || i < 0 || i > 31) throw Error('Invalid RV32I register ' + name);
    return i;
  }
  throw Error('No encoding for ' + id);
};
const hex32 = (n) => '0x' + (n >>> 0).toString(16).toUpperCase().padStart(8, '0');
function encodeInstruction(id, ins, pc) {
  const op = ins.t
      .trim()
      .replace(/^[A-Za-z_]\w*:\s*/, '')
      .split(/\s+/)[0]
      .toLowerCase(),
    x = ins.x;
  if (id === 'sq') {
    const a = (n) => (hasOwn(NAMES, n) ? NAMES[n] : Number(n));
    return {
      hex: [a(x[0]), a(x[1]), x.tg].map(hex32).join(' '),
      bits: null,
      kind: 'Teaching 3-word SUBLEQ layout (endianness unspecified)',
      bytes: 12,
    };
  }
  if (id === 'x86')
    return {
      hex: null,
      bits: null,
      kind: 'x86 instruction encoding not verified; byte count is an estimate',
      bytes: ins.sz,
    };
  let w = 0;
  if (id === 'mips') {
    const r = (n) => regNum(id, n);
    if (['addu', 'subu', 'slt'].includes(op)) {
      const funct = { addu: 0x21, subu: 0x23, slt: 0x2a }[op];
      w = (r(x[1]) << 21) | (r(x[2]) << 16) | (r(x[0]) << 11) | funct;
    } else if (['lw', 'sw'].includes(op)) {
      const [base, off] = ea(x[1]);
      w = ({ lw: 0x23, sw: 0x2b }[op] << 26) | (r(base) << 21) | (r(x[0]) << 16) | (off & 0xffff);
    } else if (op === 'addiu') w = (0x09 << 26) | (r(x[1]) << 21) | (r(x[0]) << 16) | (Number(x[2]) & 0xffff);
    else if (op === 'beq' || op === 'bne') {
      const delta = x.tg - (pc + 1);
      if (delta < -32768 || delta > 32767) throw Error('MIPS branch offset outside 16-bit range');
      w = ((op === 'beq' ? 0x04 : 0x05) << 26) | (r(x[0]) << 21) | (r(x[1]) << 16) | (delta & 0xffff);
    } else throw Error('No MIPS encoder for ' + op);
  } else if (id === 'rv') {
    const r = (n) => regNum(id, n);
    if (['add', 'sub', 'slt'].includes(op)) {
      const f3 = op === 'slt' ? 2 : 0,
        f7 = op === 'sub' ? 0x20 : 0;
      w = (f7 << 25) | (r(x[2]) << 20) | (r(x[1]) << 15) | (f3 << 12) | (r(x[0]) << 7) | 0x33;
    } else if (op === 'addi') {
      const v = Number(x[2]);
      w = ((v & 0xfff) << 20) | (r(x[1]) << 15) | (r(x[0]) << 7) | 0x13;
    } else if (op === 'lw') {
      const [base, off] = ea(x[1]);
      if (off < -2048 || off > 2047) throw Error('RV32I load offset outside 12-bit range');
      w = ((off & 0xfff) << 20) | (r(base) << 15) | (2 << 12) | (r(x[0]) << 7) | 0x03;
    } else if (op === 'sw') {
      const [base, off] = ea(x[1]);
      if (off < -2048 || off > 2047) throw Error('RV32I store offset outside 12-bit range');
      const imm = off & 0xfff;
      w = ((imm >>> 5) << 25) | (r(x[0]) << 20) | (r(base) << 15) | (2 << 12) | ((imm & 31) << 7) | 0x23;
    } else if (op === 'lui' || op === 'auipc') {
      w = ((Number(x[1]) & 0xfffff) << 12) | (r(x[0]) << 7) | (op === 'lui' ? 0x37 : 0x17);
    } else if (['beq', 'bne', 'blt', 'bge'].includes(op)) {
      const d = (x.tg - pc) * 4;
      if (d < -4096 || d > 4094 || d % 2) throw Error('RV32I branch displacement outside B-type range');
      const imm = d & 0x1fff,
        f3 = { beq: 0, bne: 1, blt: 4, bge: 5 }[op];
      w =
        (((imm >>> 12) & 1) << 31) |
        (((imm >>> 5) & 63) << 25) |
        (r(x[1]) << 20) |
        (r(x[0]) << 15) |
        (f3 << 12) |
        (((imm >>> 1) & 15) << 8) |
        (((imm >>> 11) & 1) << 7) |
        0x63;
    } else throw Error('No RV32I encoder for ' + op);
  } else throw Error('Unsupported architecture ' + id);
  return {
    hex: hex32(w),
    bits: (w >>> 0).toString(2).padStart(32, '0'),
    kind: id === 'rv' ? 'RV32I 32-bit encoding' : 'MIPS32 32-bit encoding',
    bytes: 4,
  };
}

const FIELD_COLORS = {
  opcode: '#c4b5fd',
  register: '#93c5fd',
  funct: '#fcd34d',
  immediate: '#86efac',
  misc: '#f9a8d4',
};
const field = (label, bits, color) => ({ label, bits: bits.length, value: bits, color });
export function encodingFields(id, ins, pc) {
  const e = encodeInstruction(id, ins, pc);
  if (!e.bits) return null;
  const op = ins.t
      .trim()
      .replace(/^[A-Za-z_]\w*:\s*/, '')
      .split(/\s+/)[0]
      .toLowerCase(),
    b = e.bits;
  if (id === 'mips') {
    const f = ['addu', 'subu', 'slt'].includes(op)
      ? [
          ['opcode', b.slice(0, 6), FIELD_COLORS.opcode],
          ['rs', b.slice(6, 11), FIELD_COLORS.register],
          ['rt', b.slice(11, 16), FIELD_COLORS.register],
          ['rd', b.slice(16, 21), FIELD_COLORS.register],
          ['shamt', b.slice(21, 26), FIELD_COLORS.misc],
          ['funct', b.slice(26, 32), FIELD_COLORS.funct],
        ]
      : [
          ['opcode', b.slice(0, 6), FIELD_COLORS.opcode],
          ['rs', b.slice(6, 11), FIELD_COLORS.register],
          ['rt', b.slice(11, 16), FIELD_COLORS.register],
          ['immediate', b.slice(16, 32), FIELD_COLORS.immediate],
        ];
    return f.map((x) => field(...x));
  }
  if (id === 'rv') {
    let f;
    if (['add', 'sub', 'slt'].includes(op))
      f = [
        ['funct7', b.slice(0, 7), FIELD_COLORS.funct],
        ['rs2', b.slice(7, 12), FIELD_COLORS.register],
        ['rs1', b.slice(12, 17), FIELD_COLORS.register],
        ['funct3', b.slice(17, 20), FIELD_COLORS.funct],
        ['rd', b.slice(20, 25), FIELD_COLORS.register],
        ['opcode', b.slice(25, 32), FIELD_COLORS.opcode],
      ];
    else if (op === 'sw')
      f = [
        ['imm[11:5]', b.slice(0, 7), FIELD_COLORS.immediate],
        ['rs2', b.slice(7, 12), FIELD_COLORS.register],
        ['rs1', b.slice(12, 17), FIELD_COLORS.register],
        ['funct3', b.slice(17, 20), FIELD_COLORS.funct],
        ['imm[4:0]', b.slice(20, 25), FIELD_COLORS.immediate],
        ['opcode', b.slice(25, 32), FIELD_COLORS.opcode],
      ];
    else if (['beq', 'bne', 'blt', 'bge'].includes(op))
      f = [
        ['imm[12]', b.slice(0, 1), FIELD_COLORS.immediate],
        ['imm[10:5]', b.slice(1, 7), FIELD_COLORS.immediate],
        ['rs2', b.slice(7, 12), FIELD_COLORS.register],
        ['rs1', b.slice(12, 17), FIELD_COLORS.register],
        ['funct3', b.slice(17, 20), FIELD_COLORS.funct],
        ['imm[4:1]', b.slice(20, 24), FIELD_COLORS.immediate],
        ['imm[11]', b.slice(24, 25), FIELD_COLORS.immediate],
        ['opcode', b.slice(25, 32), FIELD_COLORS.opcode],
      ];
    else if (op === 'lui' || op === 'auipc')
      f = [
        ['imm[31:12]', b.slice(0, 20), FIELD_COLORS.immediate],
        ['rd', b.slice(20, 25), FIELD_COLORS.register],
        ['opcode', b.slice(25, 32), FIELD_COLORS.opcode],
      ];
    else
      f = [
        ['imm[11:0]', b.slice(0, 12), FIELD_COLORS.immediate],
        ['rs1', b.slice(12, 17), FIELD_COLORS.register],
        ['funct3', b.slice(17, 20), FIELD_COLORS.funct],
        ['rd', b.slice(20, 25), FIELD_COLORS.register],
        ['opcode', b.slice(25, 32), FIELD_COLORS.opcode],
      ];
    return f.map((x) => field(...x));
  }
  return null;
}
export { MIPS_REG, regNum, hex32, encodeInstruction };
