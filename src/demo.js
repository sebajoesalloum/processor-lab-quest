import { mk, step, WL, PROG, MODELS } from './engine.js';
import { encodeInstruction, encodingFields } from './encoders.js';
import { explainPipeline } from './pipeline.js';
import { simulateCache } from './cache.js';
import { regLabel } from './datapath.js';

/* Professor demonstration experiments. Pure functions: every number they return is computed
   by the interpreter, pipeline model or cache simulator, so the UI and the tests share them. */

export const DEMO_ISA_WORKLOADS = ['FIB', 'MAXARR', 'SUMN'];
export const DEMO_PIPE = { arch: 'rv', branchPenalty: 2, branchPolicy: 'every' };

function runProgram(arch, mem, lines) {
  const s = mk(arch, { mem }, lines);
  while (!s.halt) step(s);
  return s;
}
function workloadInput(id, n) {
  const w = WL.find((x) => x.id === id);
  const mem = { ...w.mem };
  let ex = w.ex;
  if (id === 'FIB' && n != null) {
    mem[0] = n;
    mem[11] = n;
    let a = 0,
      b = 1;
    for (let i = 0; i < n; i++) [a, b] = [b, a + b];
    ex = a;
  }
  if (id === 'SUMN' && n != null) {
    mem[0] = n;
    ex = (n * (n + 1)) / 2;
  }
  return { w, mem, ex };
}
const opHistogram = (s) => {
  const h = {};
  for (const t of s.tr) {
    const op = t.t.replace(/^[A-Za-z_]\w*:\s*/, '').split(/\s+/)[0].toLowerCase();
    h[op] = (h[op] || 0) + 1;
  }
  return h;
};
export function demoIsaComparison(workloadId = 'FIB', n = null, cycleCosts = null) {
  if (!DEMO_ISA_WORKLOADS.includes(workloadId)) throw new Error('Unknown demo workload ' + workloadId);
  if (n != null) {
    const lim = workloadId === 'FIB' ? [0, 15] : [1, 30];
    if (!Number.isInteger(n) || n < lim[0] || n > lim[1]) throw new Error('n must be an integer from ' + lim[0] + ' to ' + lim[1]);
  }
  const { w, mem, ex } = workloadInput(workloadId, n);
  const out = { workload: workloadId, name: w.n, n: n ?? mem[0], expected: ex, runs: {} };
  for (const arch of ['mips', 'rv']) {
    const lines = PROG[w.p][arch];
    const s = runProgram(arch, mem, lines);
    const costs = cycleCosts?.[arch] || MODELS[arch].cyc;
    const multiCycles = Object.entries(s.c.cls).reduce((a, [k, v]) => a + v * (costs[k] || 0), 0);
    const pipe = explainPipeline(s.tr, { ...DEMO_PIPE, arch, forwarding: true });
    const regs = Object.entries(s.r)
      .filter(([, v]) => v !== 0)
      .map(([k, v]) => ({ reg: k, label: regLabel(arch, arch === 'rv' ? k : k), value: v | 0 }));
    out.runs[arch] = {
      arch,
      name: MODELS[arch].name,
      source: lines,
      program: s.p,
      trace: s.tr,
      staticCount: s.p.length,
      dynamic: s.c.dyn,
      classes: { ...s.c.cls },
      costs: { ...costs },
      multiCycles,
      multiCPI: s.c.dyn ? multiCycles / s.c.dyn : 0,
      pipeCycles: pipe.cycles,
      pipeCPI: pipe.cpi,
      pipeStalls: pipe.dataStalls,
      pipeBranchBubbles: pipe.branchBubbles,
      pipeMismatches: pipe.operandMismatches.length,
      histogram: opHistogram(s),
      registers: regs,
      output: s.m[3],
      ok: s.m[3] === ex && !s.err,
      err: s.err,
      codeBytes: s.p.length * 4,
    };
  }
  /* representative encodings: first instruction of each kind in each program */
  const kinds = [
    ['Load word', /^lw$/],
    ['Add immediate', /^addiu?$/],
    ['Register add', /^addu?$/],
    ['Conditional branch', /^(beq|bne|blt|bge)$/],
    ['Store word', /^sw$/],
  ];
  out.encodings = kinds.map(([label, re]) => {
    const row = { label };
    for (const arch of ['mips', 'rv']) {
      const p = out.runs[arch].program;
      const i = p.findIndex((ins) => re.test(ins.t.replace(/^[A-Za-z_]\w*:\s*/, '').split(/\s+/)[0].toLowerCase()));
      if (i < 0) {
        row[arch] = null;
        continue;
      }
      const e = encodeInstruction(arch, p[i], i);
      row[arch] = { index: i, text: p[i].t.replace(/^[A-Za-z_]\w*:\s*/, ''), hex: e.hex, fields: encodingFields(arch, p[i], i) };
    }
    return row;
  });
  const m = out.runs.mips,
    r = out.runs.rv;
  const onlyIn = (a, b) => Object.keys(a.histogram).filter((k) => !(k in b.histogram) && !['addu', 'subu', 'addiu', 'add', 'sub', 'addi'].includes(k));
  out.differences = {
    dynamicDelta: m.dynamic - r.dynamic,
    staticDelta: m.staticCount - r.staticCount,
    mipsOnly: onlyIn(m, r).map((k) => [k, m.histogram[k]]),
    rvOnly: onlyIn(r, m).map((k) => [k, r.histogram[k]]),
  };
  return out;
}

/* Experiment 2: the same program with forwarding off (run A) and on (run B). */
export const DEMO_FWD_PROGRAM = {
  rv: ['lw t0,0(a0)', 'add t1,t0,t0', 'sub t2,t1,t0', 'lw t3,4(a0)', 'add t4,t3,t2', 'sw t4,12(a0)'],
  mem: { 0: 7, 1: 5 },
  expected: 12,
};
export function demoForwarding(branchPenalty = 2) {
  const s = runProgram('rv', DEMO_FWD_PROGRAM.mem, DEMO_FWD_PROGRAM.rv);
  const opts = { arch: 'rv', branchPenalty, branchPolicy: 'every', clockMHz: 100 };
  const A = explainPipeline(s.tr, { ...opts, forwarding: false });
  const B = explainPipeline(s.tr, { ...opts, forwarding: true });
  return {
    program: DEMO_FWD_PROGRAM.rv,
    output: s.m[3],
    ok: s.m[3] === DEMO_FWD_PROGRAM.expected,
    trace: s.tr,
    A,
    B,
    saved: A.cycles - B.cycles,
    speedup: A.cycles / B.cycles,
    sameRegisters: JSON.stringify(A.finalRegs) === JSON.stringify(B.finalRegs),
  };
}

/* Experiment 3: identical access sequence, three cache configurations. */
export const DEMO_CACHE_WORKLOADS = {
  interleaved: {
    name: 'Two arrays read in step: A[i] then B[i] (B starts 64 bytes after A), two passes',
    make: () => {
      const out = [];
      for (let p = 0; p < 2; p++)
        for (let i = 0; i < 8; i++) out.push({ address: 4 * i, type: 'read' }, { address: 64 + 4 * i, type: 'read' });
      return out;
    },
  },
  scan: {
    name: 'One 24-word array summed twice (sequential scan, then reuse)',
    make: () => {
      const out = [];
      for (let p = 0; p < 2; p++) for (let i = 0; i < 24; i++) out.push({ address: 4 * i, type: 'read' });
      return out;
    },
  },
};
export const DEMO_CACHE_CONFIGS = [
  { cacheSize: 64, blockSize: 16, associativity: 1, policy: 'LRU', writePolicy: 'write-back', writeAllocate: true, hitTime: 1, missPenalty: 20 },
  { cacheSize: 64, blockSize: 16, associativity: 2, policy: 'LRU', writePolicy: 'write-back', writeAllocate: true, hitTime: 1, missPenalty: 20 },
  { cacheSize: 128, blockSize: 16, associativity: 1, policy: 'LRU', writePolicy: 'write-back', writeAllocate: true, hitTime: 1, missPenalty: 20 },
];
export function demoCache(workload = 'interleaved') {
  const W = DEMO_CACHE_WORKLOADS[workload];
  if (!W) throw new Error('Unknown cache demo workload ' + workload);
  const accesses = W.make();
  return { workload, name: W.name, accesses, configs: DEMO_CACHE_CONFIGS.map((c) => ({ ...c })), results: DEMO_CACHE_CONFIGS.map((c) => simulateCache(accesses, c)) };
}
