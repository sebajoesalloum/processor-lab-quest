import { hasOwn } from './util.js';

const NAMES = { A: 0, B: 1, C: 2, OUT: 3, T: 4, D: 5, E: 6, Z: 7, ONE: 8, N: 0 },
  LIM = 2000,
  VER = 'Processor Lab v4.0 (pipeline, cache and ISA teaching models)';
const nr = (n) =>
  String(n)
    .replace('$', '')
    .replace(/^r([a-d]x|di|si)$/, 'e$1');
const REGISTER_SETS = {
  mips: new Set([
    'zero',
    'at',
    'v0',
    'v1',
    ...Array.from({ length: 4 }, (_, i) => 'a' + i),
    ...Array.from({ length: 10 }, (_, i) => 't' + i),
    ...Array.from({ length: 8 }, (_, i) => 's' + i),
    'k0',
    'k1',
    'gp',
    'sp',
    'fp',
    'ra',
  ]),
  rv: new Set([
    'zero',
    'ra',
    'sp',
    'gp',
    'tp',
    ...Array.from({ length: 32 }, (_, i) => 'x' + i),
    ...Array.from({ length: 7 }, (_, i) => 't' + i),
    ...Array.from({ length: 8 }, (_, i) => 'a' + i),
    ...Array.from({ length: 12 }, (_, i) => 's' + i),
  ]),
  x86: new Set(['eax', 'ebx', 'ecx', 'edx', 'esi', 'edi', 'rdi', 'rsi', 'rax', 'rbx', 'rcx', 'rdx']),
};
const RV_ALIAS = {
  zero: 0,
  ra: 1,
  sp: 2,
  gp: 3,
  tp: 4,
  t0: 5,
  t1: 6,
  t2: 7,
  s0: 8,
  s1: 9,
  a0: 10,
  a1: 11,
  a2: 12,
  a3: 13,
  a4: 14,
  a5: 15,
  a6: 16,
  a7: 17,
  s2: 18,
  s3: 19,
  s4: 20,
  s5: 21,
  s6: 22,
  s7: 23,
  s8: 24,
  s9: 25,
  s10: 26,
  s11: 27,
  t3: 28,
  t4: 29,
  t5: 30,
  t6: 31,
};
const canon = (s, n) => {
  n = nr(n);
  if (!REGISTER_SETS[s.id]?.has(n)) throw Error('invalid ' + s.id + ' register ' + n);
  return s.id === 'rv' ? 'x' + (RV_ALIAS[n] ?? Number(n.slice(1))) : n;
};
const rg = (s, n) => {
  n = canon(s, n);
  if (n === 'zero' || n === 'x0') return 0;
  return s.r[n] | 0;
};
const sr = (s, n, v) => {
  n = canon(s, n);
  if (n === 'zero' || n === 'x0') return;
  s.r[n] = v | 0;
};
const ea = (a) => {
  let m = a.match(/^(-?\d+)\((\$?[a-zA-Z][\w]*)\)$/);
  if (m) return [m[2], +m[1]];
  m = a.match(/^\[([a-zA-Z][\w]*)(?:\+(-?\d+))?\]$/);
  if (m) return [m[1], +(m[2] || 0)];
  throw Error('invalid memory operand ' + a);
};
const mem = (s, a, v) => {
  const [r, o] = ea(a),
    d = rg(s, r) + o;
  if (!Number.isSafeInteger(d) || d % 4 || d < 0 || d >= 64) throw Error('invalid or unaligned address ' + d);
  s.t.add(d / 4);
  if (v === undefined) {
    s.c.rd++;
    s.accesses.push({ type: 'read', address: d, cell: d / 4, value: s.m[d / 4] | 0 });
    return s.m[d / 4];
  }
  s.c.wr++;
  s.accesses.push({ type: 'write', address: d, cell: d / 4, value: v | 0 });
  s.m[d / 4] = v | 0;
};
const al = (f) => (s, x) => {
  const v = f(rg(s, x[1]), rg(s, x[2])) | 0;
  sr(s, x[0], v);
  return x[0] + ' = ' + v;
};
const bq = (e) => (s, x) => {
  const t = (rg(s, x[0]) == rg(s, x[1])) == e;
  if (t) s.pc = x.tg;
  return t ? 'branch TAKEN, PC=' + x.tg : 'branch not taken';
};
const rop = (a, u, i) => ({
  lw: [
    ['load', 'ld'],
    (s, x) => {
      const v = mem(s, x[1]);
      sr(s, x[0], v);
      return x[0] + ' ← ' + v;
    },
  ],
  sw: [
    ['store', 'st'],
    (s, x) => {
      const v = rg(s, x[0]);
      mem(s, x[1], v);
      return 'MEM ← ' + v;
    },
  ],
  [a]: [['arith', 'alu'], al((p, q) => p + q)],
  [u]: [['arith', 'alu'], al((p, q) => p - q)],
  [i]: [
    ['arith', 'alu'],
    (s, x) => {
      const v = (rg(s, x[1]) + +x[2]) | 0;
      sr(s, x[0], v);
      return x[0] + ' = ' + v;
    },
  ],
  slt: [['arith', 'alu'], al((p, q) => +(p < q))],
  beq: [['branch', 'br'], bq(true)],
  bne: [['branch', 'br'], bq(false)],
  blt: [
    ['branch', 'br'],
    (s, x) => {
      const t = rg(s, x[0]) < rg(s, x[1]);
      if (t) s.pc = x.tg;
      return t ? 'branch TAKEN, PC=' + x.tg : 'branch not taken';
    },
  ],
  bge: [
    ['branch', 'br'],
    (s, x) => {
      const t = rg(s, x[0]) >= rg(s, x[1]);
      if (t) s.pc = x.tg;
      return t ? 'branch TAKEN, PC=' + x.tg : 'branch not taken';
    },
  ],
  lui: [
    ['arith', 'alu'],
    (s, x) => {
      const v = (Number(x[1]) << 12) | 0;
      sr(s, x[0], v);
      return x[0] + ' = ' + v;
    },
  ],
  auipc: [
    ['arith', 'alu'],
    (s, x) => {
      const v = ((s.pc - 1) * 4 + (Number(x[1]) << 12)) | 0;
      sr(s, x[0], v);
      return x[0] + ' = ' + v;
    },
  ],
});
const sf = (s, v) => {
  s.f = { ...s.f, z: (v | 0) === 0, s: (v | 0) < 0 };
  return s.f;
};
const x86Flags = (s, a, b, op) => {
  a = a | 0;
  b = b | 0;
  const r = op === 'add' ? (a + b) | 0 : (a - b) | 0;
  sf(s, r);
  s.f.o = op === 'add' ? (~(a ^ b) & (a ^ r)) < 0 : ((a ^ b) & (a ^ r)) < 0;
  s.f.c = op === 'add' ? (a >>> 0) + (b >>> 0) > 0xffffffff : a >>> 0 < b >>> 0;
  return r;
};
const xv = (s, a) => (/\[/.test(a) ? mem(s, a) : /^-?\d+$/.test(a) ? +a : rg(s, a));
const xk = (x) => (/\[/.test(x[1] || '') ? ['arith', 'alum'] : ['arith', 'alu']);
const xo = (op) => [
  xk,
  (s, x) => {
    const a = rg(s, x[0]),
      b = xv(s, x[1]),
      v = x86Flags(s, a, b, op);
    sr(s, x[0], v);
    return x[0] + ' = ' + v;
  },
];
const jc = (f) => [
  ['branch', 'br'],
  (s, x) => {
    const t = f(s.f);
    if (t) s.pc = x.tg;
    return t ? 'jump TAKEN, PC=' + x.tg : 'jump not taken';
  },
];
const X86 = {
  mov: [
    (x) => (/^\[/.test(x[0]) ? ['store', 'st'] : /\[/.test(x[1]) ? ['load', 'ld'] : ['move', 'alu']),
    (s, x) => {
      if (x[0][0] == '[') {
        mem(s, x[0], rg(s, x[1]));
        return 'MEM ← ' + rg(s, x[1]);
      }
      const v = xv(s, x[1]);
      sr(s, x[0], v);
      return x[0] + ' ← ' + v;
    },
  ],
  add: xo('add'),
  sub: xo('sub'),
  cmp: [
    xk,
    (s, x) => {
      x86Flags(s, rg(s, x[0]), xv(s, x[1]), 'sub');
      return 'ZF=' + +s.f.z + ' SF=' + +s.f.s + ' OF=' + +s.f.o + ' CF=' + +s.f.c;
    },
  ],
  neg: [
    ['arith', 'alu'],
    (s, x) => {
      const a = rg(s, x[0]),
        v = x86Flags(s, 0, a, 'sub');
      sr(s, x[0], v);
      return x[0] + ' = ' + v;
    },
  ],
  dec: [
    ['arith', 'alu'],
    (s, x) => {
      const a = rg(s, x[0]),
        oldCF = s.f.c,
        v = x86Flags(s, a, 1, 'sub');
      s.f.c = oldCF;
      sr(s, x[0], v);
      return x[0] + ' = ' + v;
    },
  ],
  jnz: jc((f) => !f.z),
  jge: jc((f) => f.s === f.o),
  jmp: jc(() => true),
};
const sqAddr = (s, n) => {
  const m = String(n).match(/^@(\d+)$/);
  if (!m) return hasOwn(NAMES, n) ? NAMES[n] : +n;
  const pointer = +m[1];
  s.accesses.push({ type: 'read', address: pointer * 4, cell: pointer, indirectPointer: true, value: s.m[pointer] | 0 });
  s.c.rd++;
  return s.m[pointer];
};
const SQ = {
  subleq: [
    ['sub+branch', 'sq'],
    (s, x) => {
      const a = sqAddr(s, x[0]),
        b = sqAddr(s, x[1]);
      if (a < 0 || a >= s.m.length || b < 0 || b >= s.m.length)
        throw Error('SUBLEQ effective address out of range');
      s.t.add(a);
      s.t.add(b);
      s.c.rd += 2;
      s.c.wr++;
      const va = s.m[a],
        vb = s.m[b],
        r = (vb - va) | 0;
      s.accesses.push(
        { type: 'read', address: a * 4, cell: a, value: va | 0 },
        { type: 'read', address: b * 4, cell: b, value: vb | 0 },
        { type: 'write', address: b * 4, cell: b, value: r }
      );
      s.m[b] = r;
      const t = r <= 0;
      if (t) s.pc = x.tg;
      return (
        `MEM[${x[1]}] = ${vb} − ${va} = ${r}; ` + (t ? '≤ 0, taken, PC=' + x.tg : '> 0, not taken, next')
      );
    },
  ],
};
const MODELS = {
  sq: {
    name: 'OISC / SUBLEQ',
    col: '#3730A3',
    ops: SQ,
    sz: () => 12,
    pw: 0.25,
    hrs: 80,
    cyc: { sq: 5 },
    ver: 'Teaching definition: 3-word instruction, instruction-indexed PC',
    rep: '1 operation (SUBLEQ)',
    org: 'Memory, PC, subtractor + sign check. No registers.',
    st: 'Memory words only; PC is an instruction index',
    fmt: '[A][B][C], three 32-bit words (12 bytes) – a chosen encoding',
    simp: 'Separate program store (Harvard-style); halts when PC leaves the program.',
  },
  mips: {
    name: 'MIPS32 (teaching subset)',
    col: '#7C3AED',
    ops: rop('addu', 'subu', 'addiu'),
    sz: () => 4,
    pw: 0.45,
    hrs: 160,
    cyc: { ld: 2, st: 2, alu: 1, br: 1 },
    ver: 'MIPS32 Architecture for Programmers Vol. I/II (S2, S3); 8-op subset',
    rep: 'Revision-dependent; no single count stated',
    org: 'Register file + ALU, explicit load/store, fixed 32-bit instructions.',
    st: '32 GPRs ($zero fixed at 0), PC',
    fmt: 'R: op rs rt rd shamt funct · I: op rs rt imm16 · J: op target26',
    simp: 'Branch delay slots abstracted; no pseudo-instructions; targets are instruction indices.',
  },
  rv: {
    name: 'RISC-V RV32I (teaching subset)',
    col: '#A855F7',
    ops: rop('add', 'sub', 'addi'),
    sz: () => 4,
    pw: 0.4,
    hrs: 140,
    cyc: { ld: 2, st: 2, alu: 1, br: 1 },
    ver: 'RISC-V Unprivileged ISA, document v20260120; RV32I base v2.1 (S1); teaching subset',
    rep: '40 base instructions (documented)',
    org: 'Register file + ALU, load/store, fixed 32-bit instructions.',
    st: 'x0–x31 (x0 fixed at 0), PC',
    fmt: 'R, I, S, B, U, J formats; opcode in bits 6:0',
    simp: 'No CSR/system/fence; no misaligned access; targets are instruction indices.',
  },
  x86: {
    name: 'x86-64 (simplified subset)',
    col: '#64748B',
    ops: X86,
    sz: (x, o) =>
      /^-?\d+$/.test(x[1] || '') ? (o == 'mov' ? 5 : 3) : 2 + (/\+[1-9]\d*\]/.test(x.join()) ? 1 : 0),
    pw: 0.8,
    hrs: 320,
    cyc: { ld: 3, st: 3, alu: 1, alum: 4, br: 2 },
    ver: 'Intel 64 SDM (S4); 32-bit operand forms, [rdi+disp8] addressing',
    rep: 'Extension-dependent; no single count stated',
    org: 'Few registers, memory operands in ALU instructions, variable-length encoding (1–15 bytes in full ISA).',
    st: 'EAX, ECX, EDX, RDI, flags ZF/SF/OF/CF, simplified instruction-indexed PC',
    fmt: '[prefix][opcode][ModRM][disp][imm]; displayed sizes are illustrative estimates',
    simp: '32-bit register arithmetic and ZF/SF/OF/CF flags modeled; no stack, calls, SIMD or system instructions. Code sizes are estimates unless verified.',
  },
};
const asm = (M, src) => {
  if (!Array.isArray(src)) throw Error('Program must be an array of lines');
  const L = Object.create(null),
    raw = [];
  src.forEach((line, j) => {
    let t = String(line)
      .replace(/(?:#|;|\/\/).*$/, '')
      .trim();
    if (!t) return;
    while (true) {
      const m = t.match(/^([A-Za-z_]\w*):\s*(.*)$/);
      if (!m) break;
      if (hasOwn(L, m[1])) throw Error('Line ' + (j + 1) + ': duplicate label ' + m[1]);
      L[m[1]] = raw.length;
      t = m[2].trim();
      if (!t) break;
    }
    if (t) raw.push({ t, line: j + 1 });
  });
  if (!raw.length) throw Error('Program is empty');
  if (raw.length > 2000) throw Error('Program too long');
  const arch = Object.entries(MODELS).find(([_, v]) => v === M)[0];
  const specs = {
    sq: { subleq: 3 },
    mips: { lw: 2, sw: 2, addu: 3, subu: 3, addiu: 3, slt: 3, beq: 3, bne: 3 },
    rv: { lw: 2, sw: 2, add: 3, sub: 3, addi: 3, slt: 3, beq: 3, bne: 3, blt: 3, bge: 3, lui: 2, auipc: 2 },
    x86: { mov: 2, add: 2, sub: 2, cmp: 2, neg: 1, dec: 1, jnz: 1, jge: 1, jmp: 1 },
  }[arch];
  const isReg = (n) => REGISTER_SETS[arch]?.has(nr(n));
  const reg = (n, line) => {
    if (!isReg(n)) throw Error('Line ' + line + ': invalid ' + arch + ' register ' + n);
  };
  const imm = (n, line) => {
    if (!/^-?\d+$/.test(n) || !Number.isSafeInteger(+n))
      throw Error('Line ' + line + ': invalid integer ' + n);
    return +n;
  };
  return raw.map(({ t, line }, i) => {
    const m = t.match(/^([A-Za-z_]\w*)\s*(.*)$/);
    if (!m) throw Error('Line ' + line + ': malformed instruction');
    const op = m[1].toLowerCase(),
      rest = m[2].trim(),
      x = rest ? rest.split(',').map((v) => v.trim()) : [];
    if (!hasOwn(specs, op)) throw Error('Line ' + line + ': unknown opcode ' + op);
    if (x.length !== specs[op] || x.some((v) => !v))
      throw Error('Line ' + line + ': ' + op + ' requires ' + specs[op] + ' operand(s)');
    if (arch === 'sq') {
      for (const n of x.slice(0, 2)) {
        const indirect = n.match(/^@(\d+)$/);
        const a = indirect ? +indirect[1] : hasOwn(NAMES, n) ? NAMES[n] : imm(n, line);
        if (a < 0 || a >= 16) throw Error('Line ' + line + ': SUBLEQ address out of range ' + n);
      }
      x.tg = x[2] === 'n' ? i + 1 : hasOwn(L, x[2]) ? L[x[2]] : imm(x[2], line);
      if (x.tg < 0 || x.tg > 2000) throw Error('Line ' + line + ': invalid SUBLEQ target');
    } else if (arch === 'x86') {
      const branch = ['jnz', 'jge', 'jmp'].includes(op);
      if (branch) {
        if (!hasOwn(L, x[0])) throw Error('Line ' + line + ': undefined branch label ' + x[0]);
        x.tg = L[x[0]];
      } else {
        const check = (n) => {
          if (/^\[/.test(n)) {
            const [r, off] = ea(n);
            reg(r, line);
            if (off % 4) throw Error('Line ' + line + ': unaligned displacement');
          } else if (!/^-?\d+$/.test(n)) reg(n, line);
          else {
            const v = imm(n, line);
            if (v < -2147483648 || v > 2147483647)
              throw Error('Line ' + line + ': 32-bit immediate out of range');
          }
        };
        x.forEach(check);
        if (/^\[/.test(x[0]) && op !== 'mov')
          throw Error('Line ' + line + ': memory destination not supported');
        if (op === 'mov' && /^\[/.test(x[0]) && (/^\[/.test(x[1]) || /^-?\d+$/.test(x[1])))
          throw Error('Line ' + line + ': memory destination requires register source');
        if (['mov', 'add', 'sub', 'cmp', 'neg', 'dec'].includes(op) && /^-?\d+$/.test(x[0]))
          throw Error('Line ' + line + ': destination must be a register or supported memory operand');
      }
    } else {
      if (['lw', 'sw'].includes(op)) {
        reg(x[0], line);
        const [r, off] = ea(x[1]);
        reg(r, line);
        if (off % 4) throw Error('Line ' + line + ': unaligned displacement');
        if (off < (arch === 'rv' ? -2048 : -32768) || off > (arch === 'rv' ? 2047 : 32767))
          throw Error(
            'Line ' + line + ': displacement outside ' + (arch === 'rv' ? '12' : '16') + '-bit range'
          );
      } else if (['beq', 'bne', 'blt', 'bge'].includes(op)) {
        reg(x[0], line);
        reg(x[1], line);
        if (!hasOwn(L, x[2])) throw Error('Line ' + line + ': undefined label ' + x[2]);
        x.tg = L[x[2]];
        if (arch === 'rv' && ((x.tg - i) * 4 < -4096 || (x.tg - i) * 4 > 4094))
          throw Error('Line ' + line + ': RV32I branch displacement outside B-type range');
      } else if (arch === 'rv' && ['lui', 'auipc'].includes(op)) {
        reg(x[0], line);
        const v = imm(x[1], line);
        if (v < 0 || v > 0xfffff)
          throw Error('Line ' + line + ': U-type immediate outside 20-bit unsigned range');
      } else {
        reg(x[0], line);
        reg(x[1], line);
        if (['addi', 'addiu'].includes(op)) {
          const v = imm(x[2], line);
          if (v < (arch === 'rv' ? -2048 : -32768) || v > (arch === 'rv' ? 2047 : 32767))
            throw Error(
              'Line ' + line + ': immediate outside ' + (arch === 'rv' ? '12' : '16') + '-bit signed range'
            );
        } else reg(x[2], line);
      }
    }
    const e = M.ops[op];
    return { t, x, k: Array.isArray(e[0]) ? e[0] : e[0](x), f: e[1], sz: M.sz(x, op), line };
  });
};

const mp = (s) => s.split('|'),
  rvf = (a) =>
    a.map((l) => l.replace(/\$/g, '').replace(/addiu/, 'addi').replace(/addu/, 'add').replace(/subu/, 'sub'));
const M0 = {
  ADD: 'lw $t0,0($a0)|lw $t1,4($a0)|addu $t2,$t0,$t1|sw $t2,12($a0)',
  COPY: 'lw $t0,0($a0)|sw $t0,12($a0)',
  NEG: 'lw $t0,0($a0)|subu $t1,$zero,$t0|sw $t1,12($a0)',
  EXPR: 'lw $t0,0($a0)|lw $t1,4($a0)|lw $t2,8($a0)|addu $t3,$t0,$t1|subu $t3,$t3,$t2|sw $t3,12($a0)',
  SUMN: 'lw $t0,0($a0)|loop: addu $t1,$t1,$t0|addiu $t0,$t0,-1|bne $t0,$zero,loop|sw $t1,12($a0)',
  MAX: 'lw $t0,0($a0)|lw $t1,4($a0)|slt $t2,$t0,$t1|beq $t2,$zero,skip|addu $t0,$t1,$zero|skip: sw $t0,12($a0)',
};
const X0 = {
  ADD: 'mov eax,[rdi]|add eax,[rdi+4]|mov [rdi+12],eax',
  COPY: 'mov eax,[rdi]|mov [rdi+12],eax',
  NEG: 'mov eax,[rdi]|neg eax|mov [rdi+12],eax',
  EXPR: 'mov eax,[rdi]|add eax,[rdi+4]|sub eax,[rdi+8]|mov [rdi+12],eax',
  SUMN: 'mov ecx,[rdi]|loop: add eax,ecx|dec ecx|jnz loop|mov [rdi+12],eax',
  MAX: 'mov eax,[rdi]|cmp eax,[rdi+4]|jge skip|mov eax,[rdi+4]|skip: mov [rdi+12],eax',
};
const S0 = {
  ADD: 'SUBLEQ A,T,n|SUBLEQ B,T,n|SUBLEQ T,OUT,n',
  COPY: 'SUBLEQ OUT,OUT,n|SUBLEQ A,T,n|SUBLEQ T,OUT,n',
  NEG: 'SUBLEQ OUT,OUT,n|SUBLEQ A,OUT,n',
  EXPR: 'SUBLEQ A,T,n|SUBLEQ B,T,n|SUBLEQ T,OUT,n|SUBLEQ C,OUT,n',
  SUMN: 'SUBLEQ N,T,n|SUBLEQ ONE,N,3|SUBLEQ Z,Z,0|SUBLEQ T,OUT,n',
  MAX: 'SUBLEQ OUT,OUT,n|SUBLEQ A,T,n|SUBLEQ T,OUT,n|SUBLEQ B,D,n|SUBLEQ T,D,6|SUBLEQ Z,Z,9|SUBLEQ OUT,OUT,n|SUBLEQ B,E,n|SUBLEQ E,OUT,n',
};
M0.ARR =
  'lw $t0,0($a0)|addiu $t3,$zero,40|loop: lw $t2,0($t3)|addu $t1,$t1,$t2|addiu $t3,$t3,4|addiu $t0,$t0,-1|bne $t0,$zero,loop|sw $t1,12($a0)';
X0.ARR = 'mov ecx,[rdi]|mov edx,40|loop: add eax,[rdx]|add edx,4|dec ecx|jnz loop|mov [rdi+12],eax';
S0.ARR = 'SUBLEQ 10,T,n|SUBLEQ 11,T,n|SUBLEQ 12,T,n|SUBLEQ 13,T,n|SUBLEQ T,OUT,n';
M0.ARRU =
  'lw $t0,40($a0)|lw $t1,44($a0)|addu $t0,$t0,$t1|lw $t1,48($a0)|addu $t0,$t0,$t1|lw $t1,52($a0)|addu $t0,$t0,$t1|sw $t0,12($a0)';
X0.ARRU = 'mov eax,[rdi+40]|add eax,[rdi+44]|add eax,[rdi+48]|add eax,[rdi+52]|mov [rdi+12],eax';
const RV0 = {
  ADD: 'lw t0,0(a0)|lw t1,4(a0)|add t2,t0,t1|sw t2,12(a0)',
  COPY: 'lw t0,0(a0)|sw t0,12(a0)',
  NEG: 'lw t0,0(a0)|sub t1,zero,t0|sw t1,12(a0)',
  EXPR: 'lw t0,0(a0)|lw t1,4(a0)|lw t2,8(a0)|add t3,t0,t1|sub t3,t3,t2|sw t3,12(a0)',
  SUMN: 'lw t0,0(a0)|loop: add t1,t1,t0|addi t0,t0,-1|bne t0,zero,loop|sw t1,12(a0)',
  MAX: 'lw t0,0(a0)|lw t1,4(a0)|blt t0,t1,replace|sw t0,12(a0)|beq zero,zero,done|replace: sw t1,12(a0)|done: addi zero,zero,0',
  ARR: 'auipc t3,0|addi t3,t3,40|lw t0,0(a0)|loop: lw t2,0(t3)|add t1,t1,t2|addi t3,t3,4|addi t0,t0,-1|bne t0,zero,loop|sw t1,12(a0)',
};
RV0.ARRU =
  'lw t0,40(a0)|lw t1,44(a0)|add t0,t0,t1|lw t1,48(a0)|add t0,t0,t1|lw t1,52(a0)|add t0,t0,t1|sw t0,12(a0)';
const CONST = {
  sq: 'SUBLEQ A,T,n|SUBLEQ T,OUT,n',
  mips: 'addiu $t0,$zero,2047|addiu $t0,$t0,1|sw $t0,12($a0)',
  rv: 'lui t0,1|addi t0,t0,-2048|sw t0,12(a0)',
  x86: 'mov eax,2047|add eax,1|mov [rdi+12],eax',
};
const FIB = {
  mips: 'lw $t0,0($a0)|addiu $t1,$zero,0|addiu $t2,$zero,1|addiu $t3,$zero,0|loop: slt $t4,$t3,$t0|beq $t4,$zero,done|addu $t4,$t1,$t2|addu $t1,$t2,$zero|addu $t2,$t4,$zero|addiu $t3,$t3,1|beq $zero,$zero,loop|done: sw $t1,12($a0)',
  rv: 'lw t0,0(a0)|addi t1,zero,0|addi t2,zero,1|addi t3,zero,0|loop: bge t3,t0,done|add t4,t1,t2|add t1,t2,zero|add t2,t4,zero|addi t3,t3,1|beq zero,zero,loop|done: sw t1,12(a0)',
  x86: 'mov ecx,[rdi]|mov eax,0|mov ebx,1|mov edx,0|loop: cmp edx,ecx|jge done|mov esi,eax|add esi,ebx|mov eax,ebx|mov ebx,esi|add edx,1|jmp loop|done: mov [rdi+12],eax',
  sq: 'loop: SUBLEQ T,T,n|SUBLEQ 11,T,n|SUBLEQ 12,12,n|SUBLEQ T,12,n|SUBLEQ Z,12,done|SUBLEQ 12,12,n|SUBLEQ ONE,11,n|SUBLEQ T,T,n|SUBLEQ 9,T,n|SUBLEQ 10,T,n|SUBLEQ T,13,n|SUBLEQ 12,12,n|SUBLEQ 10,12,n|SUBLEQ 9,9,n|SUBLEQ 12,9,n|SUBLEQ 12,12,n|SUBLEQ 10,10,n|SUBLEQ 13,12,n|SUBLEQ 12,10,n|SUBLEQ 12,12,n|SUBLEQ 13,13,n|SUBLEQ Z,Z,loop|done: SUBLEQ T,T,n|SUBLEQ 9,T,n|SUBLEQ T,OUT,n',
};
const MAXARR = {
  mips: 'lw $t0,40($a0)|addiu $t3,$zero,44|addiu $t4,$zero,3|loop: lw $t1,0($t3)|slt $t2,$t0,$t1|beq $t2,$zero,keep|addu $t0,$t1,$zero|keep: addiu $t3,$t3,4|addiu $t4,$t4,-1|bne $t4,$zero,loop|sw $t0,12($a0)',
  rv: 'lw t0,40(a0)|addi t3,zero,44|addi t4,zero,3|loop: lw t1,0(t3)|bge t0,t1,keep|add t0,t1,zero|keep: addi t3,t3,4|addi t4,t4,-1|bne t4,zero,loop|sw t0,12(a0)',
  x86: 'mov eax,[rdi+40]|mov edx,44|mov ecx,3|loop: mov ebx,[rdx]|cmp eax,ebx|jge keep|mov eax,ebx|keep: add edx,4|dec ecx|jnz loop|mov [rdi+12],eax',
  sq: 'SUBLEQ OUT,OUT,n|SUBLEQ 10,T,n|SUBLEQ T,OUT,n|SUBLEQ D,D,n|SUBLEQ T,T,n|SUBLEQ 11,T,n|SUBLEQ T,D,n|SUBLEQ OUT,D,keep1|SUBLEQ T,T,n|SUBLEQ D,T,n|SUBLEQ T,OUT,n|keep1: SUBLEQ D,D,n|SUBLEQ T,T,n|SUBLEQ 12,T,n|SUBLEQ T,D,n|SUBLEQ OUT,D,keep2|SUBLEQ T,T,n|SUBLEQ D,T,n|SUBLEQ T,OUT,n|keep2: SUBLEQ D,D,n|SUBLEQ T,T,n|SUBLEQ 13,T,n|SUBLEQ T,D,n|SUBLEQ OUT,D,keep3|SUBLEQ T,T,n|SUBLEQ D,T,n|SUBLEQ T,OUT,n|keep3: SUBLEQ Z,Z,n',
};
const ARR_LOOP_SQ =
  'loop: SUBLEQ @14,T,n|SUBLEQ 9,14,n|SUBLEQ ONE,15,done|SUBLEQ Z,Z,loop|done: SUBLEQ T,OUT,n';
const PROG = {};
for (const k of Object.keys(S0))
  PROG[k] = { sq: mp(S0[k]), mips: mp(M0[k]), rv: mp(RV0[k] || rvf(mp(M0[k]))), x86: mp(X0[k]) };
PROG.ARR = { sq: mp(S0.ARR), mips: mp(M0.ARRU), rv: mp(RV0.ARRU), x86: mp(X0.ARRU) };
PROG.CONST = { sq: mp(CONST.sq), mips: mp(CONST.mips), rv: mp(CONST.rv), x86: mp(CONST.x86) };
PROG.FIB = { sq: mp(FIB.sq), mips: mp(FIB.mips), rv: mp(FIB.rv), x86: mp(FIB.x86) };
PROG.MAXARR = { sq: mp(MAXARR.sq), mips: mp(MAXARR.mips), rv: mp(MAXARR.rv), x86: mp(MAXARR.x86) };
PROG.ARR_LOOP = { sq: mp(ARR_LOOP_SQ), mips: mp(M0.ARR), rv: mp(RV0.ARR), x86: mp(X0.ARR) };
const WL = [
  { id: 'ADD', n: 'Addition', task: 'OUT = A + B', mem: { 0: 7, 1: 5 }, ex: 12, p: 'ADD' },
  { id: 'COPY', n: 'Copy', task: 'OUT = A', mem: { 0: 9 }, ex: 9, p: 'COPY' },
  { id: 'NEG', n: 'Negation', task: 'OUT = −A', mem: { 0: 6 }, ex: -6, p: 'NEG' },
  { id: 'EXPR', n: 'Expression', task: 'OUT = (A + B) − C', mem: { 0: 7, 1: 5, 2: 3 }, ex: 9, p: 'EXPR' },
  { id: 'SUMN', n: 'Loop: sum 1..N', task: 'OUT = 1+2+…+N, N=5', mem: { 0: 5 }, ex: 15, p: 'SUMN', opt: 1 },
  {
    id: 'MAXa',
    n: 'Condition: max, A≥B',
    task: 'OUT = max(A,B), A=7,B=5 (branch skips)',
    mem: { 0: 7, 1: 5 },
    ex: 7,
    p: 'MAX',
    opt: 1,
  },
  {
    id: 'MAXb',
    n: 'Condition: max, B>A',
    task: 'OUT = max(A,B), A=3,B=8 (branch falls through)',
    mem: { 0: 3, 1: 8 },
    ex: 8,
    p: 'MAX',
    opt: 1,
  },
  {
    id: 'ARR',
    n: 'Array sum: unrolled baseline',
    task: 'OUT = 3+1+4+2 (array cells 10-13; all four programs unrolled)',
    mem: { 0: 4, 10: 3, 11: 1, 12: 4, 13: 2 },
    ex: 10,
    p: 'ARR',
    opt: 1,
  },
  {
    id: 'ARR_LOOP',
    n: 'Array sum: looped (SUBLEQ indirect extension)',
    task: 'OUT = 3+1+4+2 using a loop; SUBLEQ uses a declared indirect-address extension',
    mem: { 0: 4, 9: -1, 10: 3, 11: 1, 12: 4, 13: 2, 14: 10, 15: 4 },
    ex: 10,
    p: 'ARR_LOOP',
    opt: 1,
  },
  {
    id: 'CONST',
    n: 'RV constant construction',
    task: 'OUT = 2048 (RV32I LUI + ADDI)',
    mem: { 0: 2048 },
    ex: 2048,
    p: 'CONST',
    opt: 1,
  },
  {
    id: 'FIB',
    n: 'Fibonacci',
    task: 'OUT = Fibonacci(7) = 13',
    mem: { 0: 7, 9: 0, 10: 1, 11: 7, 12: 0, 13: 0 },
    ex: 13,
    p: 'FIB',
    opt: 1,
  },
  {
    id: 'MAXARR',
    n: 'Array maximum',
    task: 'OUT = max(3,1,4,2) = 4 (array cells 10-13)',
    mem: { 0: 0, 10: 3, 11: 1, 12: 4, 13: 2 },
    ex: 4,
    p: 'MAXARR',
    opt: 1,
  },
];
const mk = (id, w, P) => {
  const m = Array(16).fill(0);
  m[8] = 1;
  for (const k in w.mem) m[k] = w.mem[k];
  return {
    id,
    m,
    m0: m.slice(),
    r: {},
    f: { z: false, s: false, o: false, c: false },
    pc: 0,
    t: new Set(),
    accesses: [],
    c: { dyn: 0, rd: 0, wr: 0, cyc: 0, cat: {}, cls: {} },
    p: asm(MODELS[id], P || PROG[w.p][id]),
    tr: [],
    halt: false,
    err: '',
  };
};
function snapshotState(s) {
  return {
    m: s.m.slice(),
    r: { ...s.r },
    f: { ...s.f },
    pc: s.pc,
    t: [...s.t],
    accesses: s.accesses.map((a) => ({ ...a })),
    c: JSON.parse(JSON.stringify(s.c)),
    tr: s.tr.map((v) => ({ ...v })),
    last: s.last ? { ...s.last } : null,
    halt: s.halt,
    err: s.err,
  };
}
function restoreState(s, v) {
  s.m = v.m.slice();
  s.r = { ...v.r };
  s.f = { ...v.f };
  s.pc = v.pc;
  s.t = new Set(v.t);
  s.accesses = (v.accesses || []).map((a) => ({ ...a }));
  s.c = JSON.parse(JSON.stringify(v.c));
  s.tr = v.tr.map((x) => ({ ...x }));
  s.last = v.last ? { ...v.last } : null;
  s.halt = v.halt;
  s.err = v.err;
}
function step(s) {
  if (s.halt) return;
  if (s.recordHistory) {
    if (!s.history) s.history = [];
    s.history.push(snapshotState(s));
  }
  const i = s.p[s.pc];
  if (!i) {
    s.halt = true;
    return;
  }
  const b = s.m.slice(),
    br = { ...s.r },
    bf = { ...s.f },
    pc = s.pc,
    accessStart = s.accesses.length;
  s.pc++;
  try {
    const n = i.f(s, i.x),
      [ct, cl] = i.k;
    s.c.dyn++;
    s.c.cat[ct] = (s.c.cat[ct] || 0) + 1;
    s.c.cls[cl] = (s.c.cls[cl] || 0) + 1;
    const cy = MODELS[s.id].cyc[cl];
    if (!Number.isFinite(cy) || cy < 0) throw Error('Invalid cycle cost for ' + cl);
    s.c.cyc += cy;
    s.last = { k: ct, pc, t: i.t, n };
    s.tr.push({
      n: s.c.dyn,
      pc,
      nextPC: s.pc,
      t: i.t,
      note: n,
      cy,
      k: ct,
      ch: s.m.map((v, j) => (v !== b[j] ? j : -1)).filter((j) => j >= 0),
      registersBefore: br,
      registersAfter: { ...s.r },
      flagsBefore: bf,
      flagsAfter: { ...s.f },
      memoryReads: s.c.rd,
      memoryWrites: s.c.wr,
      accesses: s.accesses.slice(accessStart),
      memoryBefore: b,
      memoryAfter: s.m.slice(),
      branchTaken: ct === 'branch' || ct === 'sub+branch' ? s.pc !== pc + 1 : null,
    });
  } catch (e) {
    s.err = String(e);
    s.halt = true;
  }
  if (s.pc < 0 || s.pc >= s.p.length) s.halt = true;
  if (s.c.dyn >= LIM && !s.halt) {
    s.halt = true;
    s.err = 'execution limit (' + LIM + ') reached';
  }
}
function stepBack(s) {
  if (!s.history?.length) return false;
  restoreState(s, s.history.pop());
  return true;
}
const RC = {},
  RC_LIMIT = 400,
  run = (id, w) => {
    const key = JSON.stringify([id, w.id, w.mem, w.ex, w.p]);
    if (!RC[key] && Object.keys(RC).length >= RC_LIMIT) for (const k of Object.keys(RC)) delete RC[k];
    return (
      RC[key] ||
      (RC[key] = (() => {
        const s = mk(id, w);
        while (!s.halt) step(s);
        return {
          ...s.c,
          accesses: s.accesses.map((a) => ({ ...a })),
          st: s.p.length,
          size: s.p.reduce((a, i) => a + i.sz, 0),
          fp: s.t.size,
          got: s.m[3],
          ok: s.m[3] == w.ex && !s.err,
          err: s.err,
        };
      })())
    );
  };
const S = {
  mhz: 100,
  rate: 40,
  sel: ['sq', 'mips', 'rv', 'x86'],
  wls: WL.map((w) => w.id),
  base: 'rv',
  foc: 'ADD',
  met: 'cyc',
  cache: { cacheSize: 64, blockSize: 16, associativity: 1, policy: 'LRU', writePolicy: 'write-back', writeAllocate: true, hitTime: 1, missPenalty: 20 },
};

export {
  NAMES,
  LIM,
  VER,
  nr,
  REGISTER_SETS,
  RV_ALIAS,
  canon,
  rg,
  sr,
  ea,
  mem,
  al,
  bq,
  rop,
  sf,
  x86Flags,
  xv,
  xk,
  xo,
  jc,
  X86,
  sqAddr,
  SQ,
  MODELS,
  asm,
  mp,
  rvf,
  M0,
  X0,
  S0,
  RV0,
  CONST,
  FIB,
  MAXARR,
  ARR_LOOP_SQ,
  PROG,
  WL,
  mk,
  snapshotState,
  restoreState,
  step,
  stepBack,
  RC,
  RC_LIMIT,
  run,
  S,
};
