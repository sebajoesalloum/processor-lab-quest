import { encodeInstruction, encodingFields, MIPS_REG, regNum } from './encoders.js';
import { RV_ALIAS } from './engine.js';
import { esc } from './util.js';

/* Instruction semantics for visualisation.
   describeInstruction() turns one interpreter trace record (engine.js step()) into the
   values that travel through the datapath: registers read, ALU inputs/output, memory
   address/data, register written, branch decision and next PC. Every value is read from
   the trace (registersBefore/After, accesses, memoryBefore/After, branchTaken, nextPC);
   the ALU result is also recomputed and checked against the interpreter (aluChecked). */

const RV_ABI = Object.fromEntries(Object.entries(RV_ALIAS).map(([k, v]) => [v, k]));
const MIPS_NAME = Object.fromEntries(Object.entries(MIPS_REG).map(([k, v]) => [v, k]));
const ABI_PREF = { zero: 1, ra: 1, sp: 1, gp: 1, tp: 1 };

export function regKey(arch, name) {
  const n = String(name).trim().replace(/^\$/, '').toLowerCase();
  if (arch === 'rv') {
    if (n in RV_ALIAS) return 'x' + RV_ALIAS[n];
    if (/^x([12]?\d|3[01])$/.test(n)) return n;
    throw new Error('Unknown RV32I register ' + name);
  }
  if (arch === 'mips') {
    if (n in MIPS_REG) return n;
    throw new Error('Unknown MIPS32 register ' + name);
  }
  if (arch === 'x86') return n.replace(/^r([a-d]x|di|si)$/, 'e$1');
  return n;
}
/* Friendly name: RV shows "t0 (x5)", MIPS "$t0 ($8)". */
export function regLabel(arch, name) {
  const k = regKey(arch, name);
  if (arch === 'rv') {
    const num = Number(k.slice(1)),
      abi = RV_ABI[num];
    return (abi || k) + ' (x' + num + ')';
  }
  if (arch === 'mips') return '$' + k + ' ($' + MIPS_REG[k] + ')';
  return k.toUpperCase();
}
const isZero = (arch, k) => (arch === 'rv' && k === 'x0') || (arch === 'mips' && k === 'zero');
const readReg = (arch, regs, name) => {
  const k = regKey(arch, name);
  return isZero(arch, k) ? 0 : regs[k] | 0;
};
function parse(text) {
  const t = String(text)
    .replace(/^[A-Za-z_]\w*:\s*/, '')
    .trim();
  const m = t.match(/^([A-Za-z_]+)\s*(.*)$/);
  const op = m ? m[1].toLowerCase() : '';
  const args = m && m[2].trim() ? m[2].split(',').map((x) => x.trim()) : [];
  return { op, args, text: t };
}
const memOperand = (s) => {
  let m = s.match(/^(-?\d+)\((\$?[A-Za-z]\w*)\)$/);
  if (m) return { base: m[2], offset: Number(m[1]) };
  m = s.match(/^\[([A-Za-z]\w*)(?:\+(-?\d+))?\]$/);
  if (m) return { base: m[1], offset: Number(m[2] || 0) };
  return null;
};
const KIND = {
  mips: { lw: 'load', sw: 'store', addu: 'alu3', subu: 'alu3', slt: 'alu3', addiu: 'alui', beq: 'branch', bne: 'branch' },
  rv: {
    lw: 'load',
    sw: 'store',
    add: 'alu3',
    sub: 'alu3',
    slt: 'alu3',
    addi: 'alui',
    lui: 'upper',
    auipc: 'upper',
    beq: 'branch',
    bne: 'branch',
    blt: 'branch',
    bge: 'branch',
  },
};
const ALU_OP = { addu: '+', add: '+', addiu: '+', addi: '+', subu: '−', sub: '−', slt: '<', lui: '+', auipc: '+' };
const hex = (n, w = 8) => '0x' + (n >>> 0).toString(16).toUpperCase().padStart(w, '0');

export function describeInstruction(arch, tr, ins) {
  const { op, args, text } = parse(tr.t);
  const before = tr.registersBefore || {},
    after = tr.registersAfter || {};
  const d = {
    arch,
    op,
    text,
    index: tr.pc,
    nextIndex: tr.nextPC,
    reads: [],
    write: null,
    alu: null,
    mem: null,
    branch: null,
    imm: null,
    encoding: null,
    fields: null,
    flags: null,
    aluChecked: true,
  };
  if (arch === 'mips' || arch === 'rv') {
    d.pcByte = tr.pc * 4;
    d.nextPcByte = tr.nextPC * 4;
    d.kind = KIND[arch][op];
    if (!d.kind) throw new Error('No datapath description for ' + arch + ' opcode ' + op);
    if (ins) {
      try {
        const e = encodeInstruction(arch, ins, tr.pc);
        d.encoding = e.hex;
        d.fields = encodingFields(arch, ins, tr.pc);
      } catch (e) {
        d.encoding = null;
      }
    }
    const rd = (name, role) => {
      const value = readReg(arch, before, name);
      const r = { name, key: regKey(arch, name), label: regLabel(arch, name), role, value };
      d.reads.push(r);
      return r;
    };
    const wr = (name, computed) => {
      const k = regKey(arch, name);
      const zero = isZero(arch, k);
      const value = zero ? 0 : after[k] | 0;
      d.write = {
        name,
        key: k,
        label: regLabel(arch, name),
        value,
        old: zero ? 0 : before[k] | 0,
        discarded: zero,
        computed: computed | 0,
      };
      if (!zero && (computed | 0) !== value) d.aluChecked = false;
    };
    const aluOut = (a, b, sym) => (sym === '+' ? (a + b) | 0 : sym === '−' ? (a - b) | 0 : +(a < b));
    switch (d.kind) {
      case 'alu3': {
        const s1 = rd(args[1], arch === 'rv' ? 'rs1' : 'rs'),
          s2 = rd(args[2], arch === 'rv' ? 'rs2' : 'rt');
        const sym = ALU_OP[op],
          result = aluOut(s1.value, s2.value, sym);
        d.alu = { a: s1.value, b: s2.value, op: sym, result, aFrom: s1.label, bFrom: s2.label };
        wr(args[0], result);
        break;
      }
      case 'alui': {
        const s1 = rd(args[1], arch === 'rv' ? 'rs1' : 'rs');
        d.imm = Number(args[2]);
        const result = aluOut(s1.value, d.imm, '+');
        d.alu = { a: s1.value, b: d.imm, op: '+', result, aFrom: s1.label, bFrom: 'immediate' };
        wr(args[0], result);
        break;
      }
      case 'upper': {
        d.imm = Number(args[1]);
        const upper = (d.imm << 12) | 0;
        const a = op === 'auipc' ? d.pcByte : 0;
        const result = (a + upper) | 0;
        d.alu = {
          a,
          b: upper,
          op: '+',
          result,
          aFrom: op === 'auipc' ? 'PC' : 'zero (lui)',
          bFrom: 'imm20 << 12',
        };
        wr(args[0], result);
        break;
      }
      case 'load': {
        const mo = memOperand(args[1]);
        const base = rd(mo.base, arch === 'rv' ? 'rs1' : 'rs');
        d.imm = mo.offset;
        const address = (base.value + mo.offset) | 0;
        const acc = (tr.accesses || []).find((a) => a.type === 'read');
        const value = acc && 'value' in acc ? acc.value | 0 : after[regKey(arch, args[0])] | 0;
        d.alu = { a: base.value, b: mo.offset, op: '+', result: address, aFrom: base.label, bFrom: 'offset' };
        d.mem = { type: 'read', address, value, cell: address / 4 };
        if (acc && acc.address !== address) d.aluChecked = false;
        wr(args[0], value);
        break;
      }
      case 'store': {
        const mo = memOperand(args[1]);
        const data = rd(args[0], arch === 'rv' ? 'rs2' : 'rt');
        const base = rd(mo.base, arch === 'rv' ? 'rs1' : 'rs');
        d.imm = mo.offset;
        const address = (base.value + mo.offset) | 0;
        const acc = (tr.accesses || []).find((a) => a.type === 'write');
        d.alu = { a: base.value, b: mo.offset, op: '+', result: address, aFrom: base.label, bFrom: 'offset' };
        d.mem = {
          type: 'write',
          address,
          value: data.value,
          cell: address / 4,
          old: tr.memoryBefore ? tr.memoryBefore[address / 4] : undefined,
        };
        if (acc && (acc.address !== address || ('value' in acc && acc.value !== data.value))) d.aluChecked = false;
        break;
      }
      case 'branch': {
        const s1 = rd(args[0], arch === 'rv' ? 'rs1' : 'rs'),
          s2 = rd(args[1], arch === 'rv' ? 'rs2' : 'rt');
        const cond = { beq: '=', bne: '≠', blt: '<', bge: '≥' }[op];
        const test =
          op === 'beq'
            ? s1.value === s2.value
            : op === 'bne'
              ? s1.value !== s2.value
              : op === 'blt'
                ? s1.value < s2.value
                : s1.value >= s2.value;
        const taken = tr.branchTaken === true;
        if (test !== taken) d.aluChecked = false;
        const targetIndex = ins && Number.isInteger(ins.x?.tg) ? ins.x.tg : taken ? tr.nextPC : null;
        d.alu = {
          a: s1.value,
          b: s2.value,
          op: arch === 'mips' ? '−' : 'compare',
          result: arch === 'mips' ? (s1.value - s2.value) | 0 : +test,
          aFrom: s1.label,
          bFrom: s2.label,
        };
        const offsetBytes = targetIndex == null ? null : arch === 'mips' ? (targetIndex - (tr.pc + 1)) * 4 : (targetIndex - tr.pc) * 4;
        d.branch = {
          cond,
          test,
          taken,
          targetIndex,
          targetByte: targetIndex == null ? null : targetIndex * 4,
          offsetBytes,
          fallThroughByte: (tr.pc + 1) * 4,
        };
        d.imm = offsetBytes;
        break;
      }
    }
    if (d.kind !== 'branch' && tr.nextPC !== tr.pc + 1) d.aluChecked = false;
    d.control = controlSignals(arch, d.kind, op);
    d.hex = hex;
    return d;
  }
  if (arch === 'sq') {
    d.kind = 'subleq';
    d.pcByte = tr.pc;
    d.nextPcByte = tr.nextPC;
    const reads = (tr.accesses || []).filter((a) => a.type === 'read' && !a.indirectPointer);
    const ptr = (tr.accesses || []).filter((a) => a.indirectPointer);
    const write = (tr.accesses || []).find((a) => a.type === 'write');
    const ra = reads[0],
      rb = reads[1];
    const mb = tr.memoryBefore || [];
    const va = ra ? mb[ra.cell] | 0 : 0,
      vb = rb ? mb[rb.cell] | 0 : 0;
    const result = (vb - va) | 0;
    const c = ins?.x?.tg;
    d.subleq = {
      a: ra?.cell,
      b: rb?.cell,
      va,
      vb,
      result,
      c,
      /* the branch condition; when C is the next instruction a true condition does not change the PC */
      taken: result <= 0,
      cIsNext: c === tr.pc + 1,
      indirect: ptr.map((p) => p.cell),
    };
    if (c != null && tr.nextPC !== (result <= 0 ? c : tr.pc + 1)) d.aluChecked = false;
    d.alu = { a: vb, b: va, op: '−', result, aFrom: 'MEM[B]', bFrom: 'MEM[A]' };
    d.mem = { type: 'write', address: write?.address, cell: write?.cell, value: result, old: vb };
    if (tr.memoryAfter && write && (tr.memoryAfter[write.cell] | 0) !== result) d.aluChecked = false;
    d.branch = { cond: '≤ 0', test: result <= 0, taken: d.subleq.taken, targetIndex: d.subleq.c };
    return d;
  }
  if (arch === 'x86') {
    d.kind = 'x86';
    d.pcByte = tr.pc;
    d.nextPcByte = tr.nextPC;
    d.flags = { before: tr.flagsBefore, after: tr.flagsAfter };
    const val = (s) => {
      if (/^\[/.test(s)) {
        const mo = memOperand(s);
        const base = readReg('x86', before, mo.base);
        const address = (base + mo.offset) | 0;
        const acc = (tr.accesses || []).find((a) => a.type === 'read' && a.address === address);
        return { label: s, value: acc && 'value' in acc ? acc.value : (tr.memoryBefore || [])[address / 4] | 0, address, base, offset: mo.offset, mem: true };
      }
      if (/^-?\d+$/.test(s)) return { label: 'immediate', value: Number(s) };
      const k = regKey('x86', s);
      return { label: k.toUpperCase(), value: before[k] | 0, reg: k };
    };
    if (['jnz', 'jge', 'jmp'].includes(op)) {
      const cond = { jnz: 'ZF = 0', jge: 'SF = OF', jmp: 'always' }[op];
      d.branch = { cond, taken: tr.branchTaken === true, targetIndex: ins?.x?.tg };
      return d;
    }
    if (op === 'mov' && /^\[/.test(args[0])) {
      const src = val(args[1]);
      const mo = memOperand(args[0]);
      const base = readReg('x86', before, mo.base);
      const address = (base + mo.offset) | 0;
      d.reads.push({ label: src.label, value: src.value });
      d.alu = { a: base, b: mo.offset, op: '+', result: address, aFrom: mo.base.toUpperCase(), bFrom: 'displacement', agu: true };
      d.mem = { type: 'write', address, value: src.value, cell: address / 4 };
      return d;
    }
    const dst = regKey('x86', args[0]);
    const writeVal = after[dst] | 0;
    if (op === 'mov') {
      const src = val(args[1]);
      d.reads.push({ label: src.label, value: src.value });
      if (src.mem) {
        d.mem = { type: 'read', address: src.address, value: src.value, cell: src.address / 4 };
        d.alu = { a: src.base, b: src.offset, op: '+', result: src.address, aFrom: 'base', bFrom: 'displacement', agu: true };
      }
      d.write = { key: dst, label: dst.toUpperCase(), value: writeVal, old: before[dst] | 0, computed: src.value };
      if ((src.value | 0) !== writeVal) d.aluChecked = false;
      return d;
    }
    const a = before[dst] | 0;
    const b = op === 'neg' ? a : op === 'dec' ? 1 : val(args[1]).value;
    const bInfo = op === 'neg' || op === 'dec' ? null : val(args[1]);
    if (bInfo?.mem) d.mem = { type: 'read', address: bInfo.address, value: bInfo.value, cell: bInfo.address / 4 };
    d.reads.push({ label: dst.toUpperCase(), value: a });
    if (bInfo) d.reads.push({ label: bInfo.label, value: bInfo.value });
    const result = op === 'add' ? (a + b) | 0 : op === 'neg' ? -a | 0 : (a - b) | 0;
    d.alu = {
      a: op === 'neg' ? 0 : a,
      b: op === 'neg' ? a : b,
      op: op === 'add' ? '+' : '−',
      result,
      aFrom: op === 'neg' ? '0' : dst.toUpperCase(),
      bFrom: op === 'neg' ? dst.toUpperCase() : op === 'dec' ? 'constant 1' : bInfo.label,
    };
    if (op !== 'cmp') {
      d.write = { key: dst, label: dst.toUpperCase(), value: writeVal, old: a, computed: result };
      if (result !== writeVal) d.aluChecked = false;
    }
    return d;
  }
  throw new Error('No datapath description for architecture ' + arch);
}

/* Main control signals of the textbook single-issue datapaths (Patterson & Hennessy for MIPS;
   the analogous RISC-V organisation). X = don't care. */
export function controlSignals(arch, kind, op) {
  if (arch === 'mips') {
    const t = {
      alu3: { RegDst: 1, ALUSrc: 0, MemtoReg: 0, RegWrite: 1, MemRead: 0, MemWrite: 0, Branch: 0, ALUOp: '10' },
      alui: { RegDst: 0, ALUSrc: 1, MemtoReg: 0, RegWrite: 1, MemRead: 0, MemWrite: 0, Branch: 0, ALUOp: '00' },
      load: { RegDst: 0, ALUSrc: 1, MemtoReg: 1, RegWrite: 1, MemRead: 1, MemWrite: 0, Branch: 0, ALUOp: '00' },
      store: { RegDst: 'X', ALUSrc: 1, MemtoReg: 'X', RegWrite: 0, MemRead: 0, MemWrite: 1, Branch: 0, ALUOp: '00' },
      branch: { RegDst: 'X', ALUSrc: 0, MemtoReg: 'X', RegWrite: 0, MemRead: 0, MemWrite: 0, Branch: 1, ALUOp: '01' },
    }[kind];
    return { ...t, ...(op === 'bne' ? { BranchType: 'not-equal' } : {}) };
  }
  if (arch === 'rv') {
    const t = {
      alu3: { RegWrite: 1, ImmSel: '–', ALUSrcA: 'rs1', ALUSrcB: 'rs2', MemRead: 0, MemWrite: 0, ResultSrc: 'ALU', Branch: 0 },
      alui: { RegWrite: 1, ImmSel: 'I', ALUSrcA: 'rs1', ALUSrcB: 'imm', MemRead: 0, MemWrite: 0, ResultSrc: 'ALU', Branch: 0 },
      load: { RegWrite: 1, ImmSel: 'I', ALUSrcA: 'rs1', ALUSrcB: 'imm', MemRead: 1, MemWrite: 0, ResultSrc: 'Mem', Branch: 0 },
      store: { RegWrite: 0, ImmSel: 'S', ALUSrcA: 'rs1', ALUSrcB: 'imm', MemRead: 0, MemWrite: 1, ResultSrc: 'X', Branch: 0 },
      branch: { RegWrite: 0, ImmSel: 'B', ALUSrcA: 'rs1', ALUSrcB: 'rs2', MemRead: 0, MemWrite: 0, ResultSrc: 'X', Branch: 1 },
      upper: { RegWrite: 1, ImmSel: 'U', ALUSrcA: op === 'auipc' ? 'PC' : 'zero', ALUSrcB: 'imm', MemRead: 0, MemWrite: 0, ResultSrc: 'ALU', Branch: 0 },
    }[kind];
    return t;
  }
  return null;
}

/* ---------- Datapath layouts (SVG coordinates) ---------- */
const N = (x, y, w, h, label, extra = {}) => ({ x, y, w, h, label, ...extra });
export const DATAPATH_LAYOUTS = {
  mips: {
    title: 'MIPS32 datapath (textbook organisation, Patterson & Hennessy style)',
    note: 'Separate instruction and data memories, as in the simulator. Values on the wires come from the executed instruction; the structure is the classic teaching datapath, not a gate-level model of a specific chip. Branch delay slots are abstracted, as everywhere in this lab.',
    nodes: {
      pc: N(20, 190, 50, 70, 'PC'),
      add4: N(100, 70, 74, 44, 'Add +4'),
      imem: N(100, 170, 112, 110, 'Instruction', { sub: 'memory' }),
      ctrl: N(250, 40, 150, 44, 'Control unit'),
      regdst: N(244, 240, 22, 50, 'RegDst', { mux: true }),
      regs: N(290, 160, 150, 140, 'Register file'),
      sext: N(300, 330, 130, 40, 'Sign-extend 16→32'),
      alusrc: N(480, 225, 22, 56, 'ALUSrc', { mux: true }),
      alu: N(530, 175, 90, 110, 'ALU'),
      bradd: N(530, 70, 116, 44, 'Branch adder', { sub: 'PC+4 + (imm<<2)' }),
      pcmux: N(690, 60, 22, 64, 'PCSrc', { mux: true }),
      dmem: N(690, 175, 120, 110, 'Data memory'),
      wbmux: N(850, 200, 22, 64, 'MemtoReg', { mux: true }),
    },
    wires: {
      pc_imem: ['M70 225 H100', 72, 218],
      pc_add4: ['M84 225 V92 H100', 88, 150],
      add4_pcmux: ['M174 92 H186 V30 H668 V80 H690', 420, 26],
      add4_bradd: ['M186 92 V122 H510 V100 H530', 300, 118],
      imem_ctrl: ['M212 186 H228 V62 H250', 214, 130],
      imem_rs: ['M212 196 H290', 236, 192],
      imem_rt: ['M212 222 H232 V250 H244 M232 222 H290', 236, 218],
      imem_rd: ['M212 268 H244', 214, 264],
      regdst_regs: ['M266 265 H290', 268, 278],
      imem_sext: ['M212 276 H226 V350 H300', 230, 346],
      regs_alu_a: ['M440 195 H530', 446, 190],
      regs_alusrc: ['M440 245 H480', 444, 240],
      sext_alusrc: ['M430 350 H470 V270 H480', 436, 366],
      sext_bradd: ['M430 340 H456 V108 H530', 460, 160],
      alusrc_alu: ['M502 253 H530', 504, 270],
      alu_dmem: ['M620 215 H690', 624, 210],
      alu_pcmux: ['M575 175 V140 H701 V124', 590, 136],
      bradd_pcmux: ['M646 92 H690', 648, 86],
      pcmux_pc: ['M712 92 H740 V14 H8 V225 H20', 380, 12],
      regs_dmem: ['M462 245 V306 H660 V265 H690', 560, 302],
      dmem_wbmux: ['M810 220 H850', 812, 214],
      alu_wbmux: ['M620 262 H670 V312 H836 V250 H850', 700, 326],
      wbmux_regs: ['M872 232 H900 V396 H274 V290 H290', 560, 392],
    },
  },
  rv: {
    title: 'RV32I datapath (textbook single-issue organisation)',
    note: 'RISC-V has no RegDst multiplexer (rd is always bits 11:7), an immediate generator for the I/S/B/U formats instead of one sign-extender, and a branch adder that adds the immediate to PC (not PC+4). blt/bge compare registers directly; there are no flags. Values come from the executed instruction; the structure is a teaching datapath, not a gate-level model.',
    nodes: {
      pc: N(20, 190, 50, 70, 'PC'),
      add4: N(100, 70, 74, 44, 'Add +4'),
      imem: N(100, 170, 112, 110, 'Instruction', { sub: 'memory' }),
      ctrl: N(250, 40, 150, 44, 'Control unit'),
      regs: N(290, 160, 150, 140, 'Register file'),
      sext: N(300, 330, 130, 40, 'Immediate generator', { sub: 'I / S / B / U' }),
      alusrca: N(480, 172, 22, 46, 'ALUSrcA', { mux: true }),
      alusrc: N(480, 225, 22, 56, 'ALUSrcB', { mux: true }),
      alu: N(530, 175, 90, 110, 'ALU / compare'),
      bradd: N(530, 70, 116, 44, 'Branch adder', { sub: 'PC + imm' }),
      pcmux: N(690, 60, 22, 64, 'PCSrc', { mux: true }),
      dmem: N(690, 175, 120, 110, 'Data memory'),
      wbmux: N(850, 200, 22, 64, 'ResultSrc', { mux: true }),
    },
    wires: {
      pc_imem: ['M70 225 H100', 72, 218],
      pc_add4: ['M84 225 V92 H100', 88, 150],
      add4_pcmux: ['M174 92 H186 V30 H668 V80 H690', 420, 26],
      pc_bradd: ['M45 190 V134 H516 V100 H530', 300, 130],
      pc_alusrca: ['M45 190 V134 H470 V182 H480', 452, 150],
      imem_ctrl: ['M212 186 H228 V62 H250', 214, 130],
      imem_rs: ['M212 196 H290', 236, 192],
      imem_rt: ['M212 222 H290', 236, 218],
      imem_rd: ['M212 268 H290', 222, 264],
      imem_sext: ['M212 276 H226 V350 H300', 230, 346],
      regs_alu_a: ['M440 195 H480', 444, 190],
      alusrca_alu: ['M502 195 H530', 504, 190],
      regs_alusrc: ['M440 245 H480', 444, 240],
      sext_alusrc: ['M430 350 H470 V270 H480', 436, 366],
      sext_bradd: ['M430 340 H456 V108 H530', 460, 160],
      alusrc_alu: ['M502 253 H530', 504, 270],
      alu_dmem: ['M620 215 H690', 624, 210],
      alu_pcmux: ['M575 175 V146 H701 V124', 590, 142],
      bradd_pcmux: ['M646 92 H690', 648, 86],
      pcmux_pc: ['M712 92 H740 V14 H8 V225 H20', 380, 12],
      regs_dmem: ['M462 245 V306 H660 V265 H690', 560, 302],
      dmem_wbmux: ['M810 220 H850', 812, 214],
      alu_wbmux: ['M620 262 H670 V312 H836 V250 H850', 700, 326],
      wbmux_regs: ['M872 232 H900 V396 H274 V290 H290', 560, 392],
    },
  },
  sq: {
    title: 'SUBLEQ execution model (one instruction: subtract and branch if ≤ 0)',
    note: 'Conceptual organisation of the simulator’s SUBLEQ model: a program store holding A, B, C address words, a data memory with two reads and one write per instruction, a subtractor, a sign test and a PC selector. There are no registers and no opcode field. Values come from the executed instruction.',
    nodes: {
      pc: N(20, 190, 50, 70, 'PC'),
      add4: N(100, 70, 74, 44, 'PC + 1'),
      imem: N(100, 170, 120, 110, 'Program store', { sub: 'A · B · C' }),
      dmem: N(290, 150, 160, 150, 'Data memory', { sub: 'read A, read B, write B' }),
      alu: N(530, 175, 110, 100, 'Subtractor', { sub: 'MEM[B] − MEM[A]' }),
      ctrl: N(690, 175, 120, 50, 'Sign test', { sub: 'result ≤ 0 ?' }),
      pcmux: N(850, 60, 22, 64, 'Next PC', { mux: true }),
    },
    wires: {
      pc_imem: ['M70 225 H100', 72, 218],
      pc_add4: ['M84 225 V92 H100', 88, 150],
      add4_pcmux: ['M174 92 H186 V30 H828 V80 H850', 470, 26],
      imem_a: ['M220 196 H290', 232, 192],
      imem_b: ['M220 236 H290', 232, 232],
      imem_c: ['M220 270 H240 V380 H861 V124', 520, 376],
      dmem_alu_b: ['M450 200 H530', 456, 195],
      dmem_alu_a: ['M450 250 H530', 456, 245],
      alu_dmem: ['M585 275 V330 H370 V300', 470, 344],
      alu_ctrl: ['M640 200 H690', 642, 195],
      ctrl_pcmux: ['M750 175 V100 H850', 756, 140],
      pcmux_pc: ['M872 92 H900 V14 H8 V225 H20', 470, 12],
    },
  },
  x86: {
    title: 'x86-64 subset — conceptual execution model',
    note: 'Conceptual execution model only. The simulator models x86 architectural effects (registers, ZF/SF/OF/CF flags, memory, next instruction); it does not model an x86 microarchitecture (no µop decoding, renaming or out-of-order execution), and instruction byte lengths are estimates. Values come from the executed instruction.',
    nodes: {
      pc: N(20, 190, 50, 70, 'RIP'),
      add4: N(100, 70, 74, 44, 'RIP + len', { sub: '(estimate)' }),
      imem: N(100, 170, 112, 110, 'Instruction', { sub: 'bytes (variable)' }),
      ctrl: N(250, 40, 150, 44, 'Decoder (conceptual)'),
      regs: N(290, 160, 150, 140, 'Registers', { sub: 'EAX ECX EDX EBX ESI EDI' }),
      sext: N(300, 330, 130, 40, 'Address generation', { sub: 'base + displacement' }),
      alu: N(530, 175, 90, 110, 'ALU'),
      bradd: N(530, 70, 116, 44, 'Flags', { sub: 'ZF SF OF CF' }),
      pcmux: N(690, 60, 22, 64, 'Next', { mux: true }),
      dmem: N(690, 175, 120, 110, 'Data memory'),
      wbmux: N(850, 200, 22, 64, 'Result', { mux: true }),
    },
    wires: {
      pc_imem: ['M70 225 H100', 72, 218],
      pc_add4: ['M84 225 V92 H100', 88, 150],
      add4_pcmux: ['M174 92 H186 V30 H668 V80 H690', 420, 26],
      imem_ctrl: ['M212 186 H228 V62 H250', 214, 130],
      imem_rs: ['M212 210 H290', 230, 205],
      imem_sext: ['M212 276 H226 V350 H300', 230, 346],
      regs_alu_a: ['M440 195 H530', 446, 190],
      regs_sext: ['M440 280 H462 V340 H430', 444, 300],
      sext_dmem: ['M365 370 V386 H750 V285', 560, 382],
      dmem_alu_b: ['M690 255 H660 V253 H620', 640, 270],
      alu_flags: ['M575 175 V114', 580, 150],
      flags_pcmux: ['M646 92 H690', 648, 86],
      alu_wbmux: ['M620 262 H670 V312 H836 V250 H850', 700, 326],
      regs_dmem: ['M462 245 V306 H660 V265 H690', 560, 302],
      wbmux_regs: ['M872 232 H900 V396 H274 V290 H290', 600, 392],
      pcmux_pc: ['M712 92 H740 V14 H8 V225 H20', 380, 12],
    },
  },
};

const fmt = (v) => (v == null ? '–' : String(v));
const h8 = (n) => '0x' + (n >>> 0).toString(16).toUpperCase().padStart(4, '0');

/* Six teaching phases with the active components, wire labels (values) and explanation. */
export const PHASE_NAMES = [
  'Instruction fetch',
  'Instruction decode',
  'Register read',
  'ALU execution',
  'Memory access',
  'Write-back / next PC',
];
export function datapathPhases(d) {
  const P = [];
  const add = (active, wires, text, unused = []) => P.push({ name: PHASE_NAMES[P.length], active, wires, text, unused });
  if (d.arch === 'mips' || d.arch === 'rv') {
    const rv = d.arch === 'rv',
      k = d.kind;
    const pcs = h8(d.pcByte),
      pc4 = h8(d.pcByte + 4);
    add(['pc', 'imem', 'add4'], { pc_imem: 'PC=' + pcs, pc_add4: pcs, add4_pcmux: 'PC+4=' + pc4 }, `PC = ${pcs} (instruction ${d.index}) addresses instruction memory, which returns <code>${esc(d.text)}</code>${d.encoding ? ' = ' + d.encoding : ''}. In parallel the adder computes PC + 4 = ${pc4}.`);
    const fieldText = d.fields ? d.fields.map((f) => f.label + '=' + f.value).join(' · ') : '';
    const regRoles = d.reads.map((r) => r.role + ' = ' + r.label).join(', ');
    const decWires = { imem_ctrl: 'opcode' };
    if (d.reads[0]) decWires.imem_rs = d.reads.find((r) => /rs1?$/.test(r.role))?.label || d.reads[0].label;
    const second = d.reads.find((r) => /rt|rs2/.test(r.role));
    if (second) decWires.imem_rt = second.label;
    if (d.write) decWires.imem_rd = 'dest ' + d.write.label;
    if (!rv && d.write) decWires.regdst_regs = k === 'alu3' ? 'rd' : 'rt';
    if (d.imm != null && k !== 'alu3') decWires.imem_sext = rv ? 'imm (' + d.control.ImmSel + '-type)' : 'imm16';
    const decActive = ['imem', 'ctrl'].concat(!rv && d.write ? ['regdst'] : []);
    add(decActive, decWires, `The control unit decodes <code>${esc(d.op)}</code> (${k === 'alu3' ? (rv ? 'R-type' : 'R-type') : k === 'branch' ? (rv ? 'B-type' : 'I-type branch') : k === 'store' ? (rv ? 'S-type' : 'I-type') : k === 'upper' ? 'U-type' : 'I-type'}). Fields: ${fieldText || 'see encoding'}. ${regRoles ? 'Registers named: ' + regRoles + '.' : 'No source registers.'} Control signals: ${Object.entries(d.control).map(([a, b]) => a + '=' + b).join(', ')}.`);
    const rr = {};
    const rrActive = ['regs'];
    const readA = d.reads.find((r) => /rs1?$/.test(r.role));
    const readB = d.reads.find((r) => /rt|rs2/.test(r.role));
    if (readA) rr.regs_alu_a = readA.label + ' = ' + readA.value;
    if (readB) rr.regs_alusrc = readB.label + ' = ' + readB.value;
    if (d.imm != null) {
      rrActive.push('sext');
      rr.sext_alusrc = k === 'branch' ? '' : 'imm = ' + (k === 'upper' ? d.imm + ' (<<12 = ' + ((d.imm << 12) | 0) + ')' : d.imm);
      if (k === 'branch') rr.sext_bradd = rv ? 'imm = ' + d.imm : 'imm<<2 = ' + d.imm;
      if (!rr.sext_alusrc) delete rr.sext_alusrc;
    }
    if (rv && k === 'upper' && d.op === 'auipc') rr.pc_alusrca = 'PC=' + pcs;
    add(rrActive, rr, d.reads.length ? `The register file reads ${d.reads.map((r) => r.label + ' = ' + r.value).join(' and ')}.${d.imm != null ? ' The ' + (rv ? 'immediate generator' : 'sign-extender') + ' produces ' + (k === 'branch' ? 'the branch offset ' + d.imm + ' bytes' : 'immediate ' + (k === 'upper' ? d.imm + ' (shifted left 12 = ' + ((d.imm << 12) | 0) + ')' : d.imm)) + '.' : ''}` : `No register is read. The immediate generator produces ${d.imm} << 12 = ${(d.imm << 12) | 0}.`);
    const ex = {};
    const exActive = ['alu'];
    if (readA || (rv && k === 'upper')) {
      if (rv) {
        exActive.push('alusrca');
        ex.alusrca_alu = 'A = ' + d.alu.a;
      } else ex.regs_alu_a = 'A = ' + d.alu.a;
    }
    exActive.push('alusrc');
    ex.alusrc_alu = 'B = ' + d.alu.b;
    let exText;
    if (k === 'branch') {
      exActive.push('bradd');
      ex.bradd_pcmux = 'target ' + (d.branch.targetByte == null ? '?' : h8(d.branch.targetByte));
      ex.alu_pcmux = d.branch.test ? 'condition true' : 'condition false';
      if (rv) ex.pc_bradd = 'PC=' + pcs;
      else ex.add4_bradd = 'PC+4=' + pc4;
      exText = `${rv ? 'The comparator' : 'The ALU subtracts (' + d.alu.a + ' − ' + d.alu.b + ' = ' + d.alu.result + ') and'} checks ${d.reads[0].label} ${d.branch.cond} ${d.reads[1].label}: ${d.alu.a} ${d.branch.cond} ${d.alu.b} is <b>${d.branch.test ? 'true' : 'false'}</b>. The branch adder computes the target ${rv ? 'PC + ' + d.branch.offsetBytes : 'PC+4 + (' + (d.branch.offsetBytes / 4) + ' << 2)'} = ${d.branch.targetByte == null ? '?' : h8(d.branch.targetByte)}.`;
    } else if (k === 'load' || k === 'store') {
      ex.alu_dmem = 'address ' + d.alu.result;
      exText = `The ALU adds base ${d.alu.aFrom} = ${d.alu.a} and offset ${d.alu.b}: effective address = <b>${d.alu.result}</b> (word ${d.alu.result / 4}).`;
    } else {
      ex.alu_wbmux = 'result ' + d.alu.result;
      exText = `The ALU computes ${d.alu.a} ${d.alu.op} ${d.alu.b} = <b>${d.alu.result}</b>${d.op === 'slt' ? ' (1 if less than, else 0)' : ''}.`;
    }
    add(exActive, ex, exText);
    if (k === 'load') add(['dmem'], { alu_dmem: 'addr ' + d.mem.address, dmem_wbmux: 'data ' + d.mem.value }, `Data memory reads word ${d.mem.cell} (address ${d.mem.address}) and returns <b>${d.mem.value}</b>.`);
    else if (k === 'store') add(['dmem'], { alu_dmem: 'addr ' + d.mem.address, regs_dmem: 'data ' + d.mem.value }, `Data memory writes <b>${d.mem.value}</b> to word ${d.mem.cell} (address ${d.mem.address})${d.mem.old !== undefined ? ', replacing ' + d.mem.old : ''}.`);
    else if (k === 'branch') add(['pcmux'], { bradd_pcmux: 'target', add4_pcmux: 'PC+4', alu_pcmux: d.branch.taken ? 'take branch' : 'fall through' }, `No data-memory access. PCSrc selects ${d.branch.taken ? '<b>the branch target</b> ' + h8(d.branch.targetByte) : '<b>PC + 4</b> ' + pc4} because the condition is ${d.branch.test ? 'true' : 'false'}.`, ['dmem']);
    else add([], { alu_wbmux: 'result ' + d.alu.result }, 'No data-memory access: the ALU result bypasses data memory.', ['dmem']);
    const wb = {};
    let wbText;
    if (d.write) {
      wb[k === 'load' ? 'dmem_wbmux' : 'alu_wbmux'] = String(k === 'load' ? d.mem.value : d.alu.result);
      wb.wbmux_regs = d.write.label + ' ← ' + d.write.value;
      wbText = d.write.discarded
        ? `The result would be written to ${d.write.label}, but that register is hard-wired to 0, so the write is discarded.`
        : `${rv ? 'ResultSrc' : 'MemtoReg'} selects the ${k === 'load' ? 'memory data' : 'ALU result'}; the register file writes <b>${d.write.label} ← ${d.write.value}</b> (was ${d.write.old}).`;
    } else wbText = k === 'store' ? 'A store has no register write-back (RegWrite = 0).' : 'A branch has no register write-back (RegWrite = 0).';
    wb.pcmux_pc = 'PC ← ' + h8(d.nextPcByte);
    add(['pcmux', 'pc'].concat(d.write ? ['wbmux', 'regs'] : []), wb, wbText + ` The PC is updated to ${h8(d.nextPcByte)} (instruction ${d.nextIndex}).`, d.write ? [] : ['wbmux']);
    return P;
  }
  if (d.arch === 'sq') {
    const s = d.subleq;
    add(['pc', 'imem', 'add4'], { pc_imem: 'PC=' + d.index, pc_add4: String(d.index), add4_pcmux: 'PC+1=' + (d.index + 1) }, `PC = ${d.index} selects <code>${esc(d.text)}</code>: three address words A, B, C.`);
    add(['imem'], { imem_a: 'A = ' + s.a, imem_b: 'B = ' + s.b, imem_c: 'C = ' + fmt(s.c) }, `There is no opcode to decode: every instruction is SUBLEQ. The fields give A = cell ${s.a}, B = cell ${s.b}, branch target C = ${fmt(s.c)}.${s.indirect.length ? ' Indirect extension: A was read through pointer cell ' + s.indirect.join(', ') + '.' : ''}`);
    add(['dmem'], { dmem_alu_a: 'MEM[A] = ' + s.va, dmem_alu_b: 'MEM[B] = ' + s.vb }, `Operand read: data memory supplies MEM[${s.a}] = ${s.va} and MEM[${s.b}] = ${s.vb}. (SUBLEQ has no registers, so operands come from memory.)`);
    add(['alu'], { alu_ctrl: 'result ' + s.result }, `The subtractor computes MEM[B] − MEM[A] = ${s.vb} − ${s.va} = <b>${s.result}</b>.`);
    add(['dmem'], { alu_dmem: 'MEM[' + s.b + '] ← ' + s.result }, `Memory write: MEM[${s.b}] ← ${s.result} (was ${s.vb}).`);
    add(['ctrl', 'pcmux', 'pc'], { alu_ctrl: String(s.result), ctrl_pcmux: s.result <= 0 ? '≤ 0: take C' : '> 0: next', pcmux_pc: 'PC ← ' + d.nextIndex }, `Sign test: ${s.result} ${s.result <= 0 ? '≤ 0, so the branch is <b>taken</b>: PC ← C = ' + fmt(s.c) + (s.cIsNext ? ' (C is the next instruction, so execution continues in sequence)' : '') : '> 0, so execution <b>falls through</b>: PC ← ' + (d.index + 1)}.`);
    return P;
  }
  if (d.arch === 'x86') {
    add(['pc', 'imem', 'add4'], { pc_imem: 'RIP→#' + d.index, pc_add4: '#' + d.index }, `Instruction ${d.index}: <code>${esc(d.text)}</code> is fetched. x86 instructions have variable length; the byte count used here is an estimate.`);
    add(['imem', 'ctrl'], { imem_ctrl: 'bytes' }, `Conceptual decode of <code>${esc(d.op)}</code>${d.mem ? ' with a memory operand (the CISC feature: one instruction both accesses memory and computes)' : ''}.`);
    if (d.branch) {
      add([], {}, 'A jump reads no general-purpose registers.', ['regs']);
      add(['bradd'], { flags_pcmux: d.branch.cond }, `The condition ${d.branch.cond} is evaluated from the flags set by an earlier instruction (ZF=${+!!d.flags.before?.z} SF=${+!!d.flags.before?.s} OF=${+!!d.flags.before?.o}).`);
      add([], {}, 'No data-memory access.', ['dmem']);
      add(['pcmux', 'pc'], { pcmux_pc: 'RIP→#' + d.nextIndex }, `The jump is <b>${d.branch.taken ? 'taken' : 'not taken'}</b>: next instruction ${d.nextIndex}.`);
      return P;
    }
    const rr = {};
    if (d.reads.length) rr.regs_alu_a = d.reads.map((r) => r.label + '=' + r.value).join(', ');
    if (d.mem) rr.regs_sext = 'base';
    add(['regs'].concat(d.mem ? ['sext'] : []), rr, `Operands: ${d.reads.map((r) => r.label + ' = ' + r.value).join(', ') || 'none'}.${d.mem ? ' The address generator adds base + displacement = ' + d.mem.address + '.' : ''}`);
    const ex = {};
    if (d.alu && !d.alu.agu) {
      ex.alu_flags = 'flags';
      if (d.mem && d.mem.type === 'read') ex.dmem_alu_b = 'MEM=' + d.mem.value;
      add(['alu', 'bradd'].concat(d.mem && d.mem.type === 'read' ? ['dmem'] : []), ex, `${d.mem && d.mem.type === 'read' ? 'The memory operand MEM[' + d.mem.address + '] = ' + d.mem.value + ' is read, then the' : 'The'} ALU computes ${d.alu.a} ${d.alu.op} ${d.alu.b} = <b>${d.alu.result}</b> and updates the flags: ZF=${+!!d.flags.after?.z} SF=${+!!d.flags.after?.s} OF=${+!!d.flags.after?.o} CF=${+!!d.flags.after?.c}.`);
    } else add([], {}, 'A MOV performs no ALU operation and leaves the flags unchanged.', ['alu']);
    if (d.mem && d.mem.type === 'read' && d.alu && !d.alu.agu)
      add([], {}, `No further memory access: the memory operand (MEM[${d.mem.address}] = ${d.mem.value}) was already read before the ALU step. This load-then-operate pattern is what lets one x86 instruction do the work of a RISC load plus an add.`, ['dmem']);
    else if (d.mem) add(['dmem', 'sext'], d.mem.type === 'write' ? { sext_dmem: 'addr ' + d.mem.address, regs_dmem: 'data ' + d.mem.value } : { sext_dmem: 'addr ' + d.mem.address }, d.mem.type === 'write' ? `Data memory writes <b>${d.mem.value}</b> to word ${d.mem.cell} (address ${d.mem.address}).` : `Data memory read of word ${d.mem.cell} (address ${d.mem.address}) returned ${d.mem.value}.`);
    else add([], {}, 'No data-memory access.', ['dmem']);
    const wb = { pcmux_pc: 'RIP→#' + d.nextIndex };
    if (d.write) wb.wbmux_regs = d.write.label + ' ← ' + d.write.value;
    add(['pc', 'pcmux'].concat(d.write ? ['wbmux', 'regs'] : []), wb, d.write ? `Register write: <b>${d.write.label} ← ${d.write.value}</b> (was ${d.write.old}). Next instruction ${d.nextIndex}.` : `${d.op === 'cmp' ? 'CMP only sets flags; no register is written.' : 'No register write.'} Next instruction ${d.nextIndex}.`);
    return P;
  }
  return P;
}
export { hex as hexWord };
export const _internal = { regNum };
