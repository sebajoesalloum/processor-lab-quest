/* Five-stage, in-order teaching pipeline. This is a timing model, not RTL. */
const RV_NAMES = {
  zero: 'x0',
  ra: 'x1',
  sp: 'x2',
  gp: 'x3',
  tp: 'x4',
  t0: 'x5',
  t1: 'x6',
  t2: 'x7',
  s0: 'x8',
  s1: 'x9',
  a0: 'x10',
  a1: 'x11',
  a2: 'x12',
  a3: 'x13',
  a4: 'x14',
  a5: 'x15',
  a6: 'x16',
  a7: 'x17',
  s2: 'x18',
  s3: 'x19',
  s4: 'x20',
  s5: 'x21',
  s6: 'x22',
  s7: 'x23',
  s8: 'x24',
  s9: 'x25',
  s10: 'x26',
  s11: 'x27',
  t3: 'x28',
  t4: 'x29',
  t5: 'x30',
  t6: 'x31',
};
function normReg(v, arch) {
  const n = String(v || '')
    .replace(/^\$/, '')
    .toLowerCase();
  if (arch === 'rv') return RV_NAMES[n] || n;
  return n;
}
/* Opcode tables are per ISA and must stay in sync with the interpreter's assembler
   (tests/regression.test.js checks that every opcode the assembler accepts is listed here).
   kind: load | store | alu3 (rd,rs,rt) | alui (rd,rs,imm) | upper (rd,imm) | branch (rs,rt,label) */
const PIPE_OPS = {
  mips: {
    lw: 'load',
    sw: 'store',
    addu: 'alu3',
    subu: 'alu3',
    slt: 'alu3',
    addiu: 'alui',
    beq: 'branch',
    bne: 'branch',
  },
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
const OPERANDS = { load: 2, store: 2, alu3: 3, alui: 3, upper: 2, branch: 3 };
const isZeroReg = (r) => r === 'x0' || r === 'zero' || r === '0';
export const PIPELINE_SUPPORTED_ARCHS = Object.keys(PIPE_OPS);
export function pipelineOpcodes(arch) {
  if (!PIPE_OPS[arch])
    throw new Error(
      'Pipeline model supports only ' + PIPELINE_SUPPORTED_ARCHS.join(' and ') + ', not "' + arch + '".'
    );
  return Object.keys(PIPE_OPS[arch]);
}
function decodeHazards(assembly, arch) {
  if (!PIPE_OPS[arch])
    throw new Error(
      'Pipeline model supports only ' + PIPELINE_SUPPORTED_ARCHS.join(' and ') + ', not "' + arch + '".'
    );
  const line = String(assembly)
    .replace(/^[A-Za-z_]\w*:\s*/, '')
    .trim();
  const m = line.match(/^([A-Za-z]+)\s*(.*)$/);
  if (!m) throw new Error('Pipeline model cannot parse instruction "' + assembly + '".');
  const op = m[1].toLowerCase(),
    kind = PIPE_OPS[arch][op];
  if (!kind)
    throw new Error(
      'Pipeline model: unsupported ' +
        arch +
        ' opcode "' +
        op +
        '" in "' +
        line +
        '". Add it to PIPE_OPS with its hazard behaviour instead of letting it run with no dependencies.'
    );
  const a = m[2].split(',').map((x) => x.trim());
  if (a.length !== OPERANDS[kind] || a.some((x) => !x))
    throw new Error('Pipeline model: "' + line + '" needs ' + OPERANDS[kind] + ' operands.');
  const regOf = (x) => {
    const mm = String(x).match(/[A-Za-z$][\w$]*|\$\d+/);
    if (!mm)
      throw new Error('Pipeline model: cannot find a register in operand "' + x + '" of "' + line + '".');
    const r = normReg(mm[0], arch);
    return isZeroReg(r) ? null : r; // the zero register never carries a dependency
  };
  switch (kind) {
    case 'load':
      return { src: [regOf(a[1])], dst: regOf(a[0]), load: true, branch: false };
    case 'store':
      return { src: [regOf(a[0]), regOf(a[1])], dst: null, load: false, branch: false };
    case 'alu3':
      return { src: [regOf(a[1]), regOf(a[2])], dst: regOf(a[0]), load: false, branch: false };
    case 'alui':
      return { src: [regOf(a[1])], dst: regOf(a[0]), load: false, branch: false };
    case 'upper':
      return { src: [], dst: regOf(a[0]), load: false, branch: false };
    case 'branch':
      return { src: [regOf(a[0]), regOf(a[1])], dst: null, load: false, branch: true };
  }
}
/* Convert an interpreter trace (engine.js step() records) into pipeline input.
   `taken` comes from the interpreter's own branch outcome, not from guessing. */
export function traceToPipelineInput(trace) {
  return trace.map((t) => ({
    t: t.t,
    taken: t.k === 'branch' ? /^branch TAKEN/.test(String(t.note)) : false,
  }));
}
export function simulatePipeline(assembly, options = {}) {
  const arch = options.arch || 'rv';
  const forwarding = options.forwarding !== false;
  const branchPenalty = Math.max(0, Math.min(10, Number(options.branchPenalty ?? 2) || 0));
  const branchPolicy = options.branchPolicy ?? 'every';
  if (branchPolicy !== 'every' && branchPolicy !== 'taken')
    throw new Error('branchPolicy must be "every" or "taken", not "' + branchPolicy + '".');
  const producers = [];
  const rows = [];
  let nextIF = 1,
    dataStalls = 0,
    branchBubbles = 0,
    branchesExecuted = 0,
    branchesTaken = 0;
  for (let index = 0; index < assembly.length; index++) {
    const text = typeof assembly[index] === 'string' ? assembly[index] : assembly[index].t;
    const d = decodeHazards(text, arch);
    let taken = false;
    if (d.branch) {
      if (branchPolicy === 'taken') {
        if (typeof assembly[index] !== 'object' || typeof assembly[index].taken !== 'boolean')
          throw new Error(
            'branchPolicy "taken" needs a {t, taken} entry for branch "' +
              text +
              '" (use traceToPipelineInput on an interpreter trace).'
          );
      }
      taken = typeof assembly[index] === 'object' && assembly[index].taken === true;
    }
    const IF = nextIF,
      ID = IF + 1;
    let EX = ID + 1;
    let stalls = 0;
    for (const src of d.src.filter(Boolean)) {
      const p = [...producers].reverse().find((x) => x.dst === src);
      if (!p) continue;
      const ready = forwarding ? (p.load ? p.MEM : p.EX) : p.WB;
      if (EX <= ready) {
        const add = ready + 1 - EX;
        stalls = Math.max(stalls, add);
      }
    }
    EX += stalls;
    dataStalls += stalls;
    const MEM = EX + 1,
      WB = EX + 2;
    const row = {
      index,
      assembly: text,
      IF,
      ID,
      EX,
      MEM,
      WB,
      stalls,
      branch: d.branch,
      src: d.src,
      dst: d.dst,
      load: d.load,
    };
    row.stages = {};
    row.stages[IF] = 'IF';
    for (let c = ID; c < EX; c++) row.stages[c] = c === ID ? 'ID' : 'ID*';
    row.stages[EX] = 'EX';
    row.stages[MEM] = 'MEM';
    row.stages[WB] = 'WB';
    rows.push(row);
    if (d.dst) producers.push({ dst: d.dst, EX, MEM, WB, load: d.load });
    let bubbles = 0;
    if (d.branch) {
      branchesExecuted++;
      if (taken) branchesTaken++;
      bubbles = branchPolicy === 'every' || taken ? branchPenalty : 0;
      branchBubbles += bubbles;
    }
    row.taken = taken;
    row.branchBubbles = bubbles;
    nextIF = IF + 1 + stalls + bubbles;
  }
  const cycles = rows.length ? Math.max(...rows.map((r) => r.WB)) : 0;
  return {
    rows,
    cycles,
    instructions: rows.length,
    cpi: rows.length ? cycles / rows.length : 0,
    dataStalls,
    branchBubbles,
    totalStalls: dataStalls + branchBubbles,
    forwarding,
    branchPenalty,
    branchPolicy,
    branchesExecuted,
    branchesTaken,
    arch,
  };
}

/* ---------- Interactive explanation model (4.0) ----------
   explainPipeline() takes an interpreter trace, runs simulatePipeline() on it, and
   derives, for every clock cycle, what occupies IF/ID/EX/MEM/WB, which hazards were
   detected, which forwarding paths carry which values, where bubbles came from, and
   when branches resolve. It also re-derives every source operand value the pipeline
   would deliver (forwarded or read from the register file at that cycle) and checks
   it against the interpreter's architectural value, so a timing bug that would read a
   stale register is reported instead of hidden. */
export const STAGES = ['IF', 'ID', 'EX', 'MEM', 'WB'];
function regKeyFor(arch, name) {
  return normReg(name, arch);
}
export function explainPipeline(trace, options = {}) {
  const arch = options.arch || 'rv';
  const input = traceToPipelineInput(trace);
  const r = simulatePipeline(input, options);
  /* test hook: lets a test deliberately corrupt the schedule to prove the operand check catches it */
  if (typeof options.mutateSchedule === 'function') options.mutateSchedule(r.rows);
  const rows = r.rows;
  const n = rows.length;
  const valueOf = (i, reg) => {
    /* architectural value of `reg` after instruction i (engine register keys) */
    const t = trace[i];
    return t.registersAfter[engineKey(arch, reg)] | 0;
  };
  const initialValue = (reg) => (trace[0]?.registersBefore?.[engineKey(arch, reg)] | 0) || 0;
  const operands = [];
  const hazards = [];
  for (let i = 0; i < n; i++) {
    const row = rows[i];
    row.fetchStart = row.IF;
    row.deps = [];
    const seen = new Set();
    row.src.forEach((reg, slot) => {
      if (!reg || seen.has(reg)) return;
      seen.add(reg);
      let p = -1;
      for (let j = i - 1; j >= 0; j--)
        if (rows[j].dst === reg) {
          p = j;
          break;
        }
      const naturalEX = row.ID + 1;
      const readCycle = row.EX - 1; /* last ID cycle: register file read (write first half, read second half) */
      /* value the hardware delivers */
      let via, delivered, source;
      const fwdCands = [];
      if (r.forwarding)
        for (let j = i - 1; j >= 0; j--) {
          const q = rows[j];
          if (q.dst !== reg) continue;
          if (q.MEM === row.EX && !q.load) fwdCands.push({ j, path: 'EX/MEM → EX' });
          else if (q.WB === row.EX) fwdCands.push({ j, path: 'MEM/WB → EX' });
        }
      if (fwdCands.length) {
        const c = fwdCands[0];
        via = c.path;
        delivered = valueOf(c.j, reg);
        source = c.j;
      } else {
        let q = -1;
        for (let j = i - 1; j >= 0; j--)
          if (rows[j].dst === reg && rows[j].WB <= readCycle) {
            q = j;
            break;
          }
        via = 'register file';
        delivered = q >= 0 ? valueOf(q, reg) : initialValue(reg);
        source = q;
      }
      const expected = trace[i].registersBefore[engineKey(arch, reg)] | 0;
      const op = { consumer: i, reg, slot, via, source, delivered, expected, ok: delivered === expected };
      operands.push(op);
      if (p < 0) return;
      const producer = rows[p];
      const hazard = producer.WB > row.ID; /* value not in the register file when first read */
      if (!hazard) {
        row.deps.push({ producer: p, reg, hazard: false, via: 'register file', distance: i - p });
        return;
      }
      const ready = r.forwarding ? (producer.load ? producer.MEM : producer.EX) : producer.WB;
      const stallsNeeded = Math.max(0, ready + 1 - naturalEX);
      const kind = producer.load && r.forwarding && stallsNeeded > 0 ? 'load-use' : 'RAW';
      const h = {
        consumer: i,
        producer: p,
        reg,
        kind,
        distance: i - p,
        stallsNeeded,
        resolvedBy: via,
        forwarded: via !== 'register file',
        value: delivered,
        detectCycle: row.ID,
        useCycle: row.EX,
      };
      hazards.push(h);
      row.deps.push({ producer: p, reg, hazard: true, via, kind, stallsNeeded, distance: i - p });
    });
  }
  /* instruction i+1 is fetched while i is decoding; when i stalls in ID, i+1 is held in IF */
  for (let i = 1; i < n; i++) {
    const prev = rows[i - 1];
    if (!prev.branch && prev.stalls > 0) rows[i].fetchStart = prev.IF + 1;
    if (prev.branch && prev.branchBubbles === 0 && prev.stalls > 0) rows[i].fetchStart = prev.IF + 1;
  }
  const cycles = r.cycles;
  /* Build per-cycle occupancy in O(cycles + rows) using lookup arrays (large programs stay fast). */
  const mkArr = () => Array(cycles + 2).fill(-1);
  const at = { IF: mkArr(), ID: mkArr(), EX: mkArr(), MEM: mkArr(), WB: mkArr() },
    hold = mkArr(),
    idStall = mkArr(),
    brFetch = mkArr(),
    brStallFetch = mkArr();
  const byEX = new Map(),
    byDetect = new Map(),
    byResolve = new Map(),
    byWB = new Map();
  const push = (m, k, v) => (m.has(k) ? m.get(k).push(v) : m.set(k, [v]));
  for (let i = 0; i < n; i++) {
    const row = rows[i];
    for (let c = row.fetchStart; c < row.IF; c++) hold[c] = i;
    at.IF[row.IF] = i;
    at.ID[row.ID] = i;
    for (let c = row.ID + 1; c < row.EX; c++) idStall[c] = i;
    at.EX[row.EX] = i;
    at.MEM[row.MEM] = i;
    at.WB[row.WB] = i;
    if (row.branch && row.branchBubbles > 0) {
      for (let c = row.IF + row.stalls + 1; c <= row.IF + row.stalls + row.branchBubbles && c <= cycles; c++) brFetch[c] = i;
      for (let c = row.IF + 1; c <= row.IF + row.stalls && c <= cycles; c++) brStallFetch[c] = i;
    }
    if (row.branch) byResolve.set(row.EX, i);
    if (row.dst) push(byWB, row.WB, i);
  }
  for (const h of hazards) push(byDetect, h.detectCycle, h);
  for (const o of operands) if (o.via !== 'register file') push(byEX, rows[o.consumer].EX, o);
  const timeline = [];
  let completed = 0;
  for (let c = 1; c <= cycles; c++) {
    const slot = {};
    STAGES.forEach((st, k) => {
      if (st === 'IF') {
        if (at.IF[c] >= 0) return (slot.IF = { row: at.IF[c], state: 'active' });
        if (hold[c] >= 0) return (slot.IF = { row: hold[c], state: 'hold' });
      } else if (st === 'ID') {
        if (at.ID[c] >= 0) return (slot.ID = { row: at.ID[c], state: 'active' });
        if (idStall[c] >= 0) return (slot.ID = { row: idStall[c], state: 'stall' });
      } else if (at[st][c] >= 0) return (slot[st] = { row: at[st][c], state: 'active' });
      /* explain the empty stage */
      if (k >= 2) {
        const ins = c - (k - 2); /* cycle in which a bubble would have entered EX */
        if (ins >= 1 && idStall[ins] >= 0) return (slot[st] = { row: null, state: 'bubble', cause: 'stall', by: idStall[ins] });
      }
      const fc = c - k;
      if (fc >= 1 && brFetch[fc] >= 0)
        return (slot[st] = { row: null, state: r.branchPolicy === 'taken' ? 'flush' : 'bubble', cause: 'branch', by: brFetch[fc] });
      if (fc >= 1 && brStallFetch[fc] >= 0) return (slot[st] = { row: null, state: 'bubble', cause: 'branch', by: brStallFetch[fc] });
      slot[st] = { row: null, state: 'empty', cause: c < (rows[0]?.WB ?? 0) ? 'fill' : 'drain' };
    });
    const forwards = (byEX.get(c) || []).map((o) => {
      const h = hazards.find((x) => x.consumer === o.consumer && x.reg === o.reg);
      return h || { consumer: o.consumer, producer: o.source, reg: o.reg, resolvedBy: o.via, value: o.delivered, forwarded: true };
    });
    const writes = (byWB.get(c) || []).map((i) => ({ row: i, reg: rows[i].dst, value: valueOf(i, rows[i].dst) }));
    completed += at.WB[c] >= 0 ? 1 : 0;
    timeline.push({
      cycle: c,
      slot,
      forwards,
      detected: byDetect.get(c) || [],
      stalled: idStall[c],
      branchResolve: byResolve.has(c) ? byResolve.get(c) : -1,
      writes,
      completed,
    });
  }
  const finalRegs = trace.length ? { ...trace[trace.length - 1].registersAfter } : {};
  const mhz = Number(options.clockMHz ?? 0);
  return {
    ...r,
    rows,
    timeline,
    hazards,
    operands,
    operandMismatches: operands.filter((o) => !o.ok),
    finalRegs,
    loadUseHazards: hazards.filter((h) => h.kind === 'load-use').length,
    forwardedOperands: operands.filter((o) => o.via !== 'register file').length,
    clockMHz: mhz || null,
    timeNs: mhz > 0 ? (r.cycles * 1000) / mhz : null,
  };
}
/* pipeline names (x5 / t0) -> engine register keys (x5 for RV, t0 for MIPS) */
function engineKey(arch, reg) {
  return regKeyFor(arch, reg);
}
