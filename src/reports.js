export function buildSnapshot(data) {
  return {
    lab: data.lab,
    credit: data.credit,
    settings: data.settings,
    workloads: data.workloads,
    programs: data.programs,
    limit: data.limit,
    results: data.results,
  };
}
export function resultsToCSV(rows) {
  const columns = [
    'model',
    'workload',
    'static',
    'dynamic',
    'cycles',
    'cpi',
    'pipeline_cycles',
    'pipeline_cpi',
    'time_ns',
    'energy_nj',
    'reads',
    'writes',
    'code_bytes',
    'cache_hits',
    'cache_misses',
    'cache_miss_rate',
    'amat_cycles',
    'ok',
  ];
  const quote = (v) => {
    const x = String(v ?? '');
    return /[",\n\r]/.test(x) ? '"' + x.replace(/"/g, '""') + '"' : x;
  };
  return columns.join(',') + '\n' + rows.map((row) => columns.map((k) => quote(row[k])).join(',')).join('\n');
}
export function methodologyHtml() {
  return `<p><b>Methodology — four evidence classes:</b></p><ol><li><b>ISA facts:</b> instruction formats, register rules, branch semantics and immediate layouts are taken from named architecture specifications. The RV32I base module is version 2.1; this report references the RISC-V Unprivileged ISA document version v20260120.</li><li><b>Simulated (trace-derived) counts:</b> static and dynamic instruction counts, executed instruction mix, data reads/writes and accessed addresses come from the simulator’s actual interpreter trace. Pipeline schedules are derived from the dynamic trace and the declared five-stage rules.</li><li><b>Editable assumptions and calculated values:</b> cycle costs, clock rate, cache size/block size/associativity/replacement/write policy, hit time, miss penalty, forwarding and branch penalty are teaching-model inputs. Cycles, CPI, AMAT and time are <i>calculated</i> from simulated counts and those inputs; energy (assumed power × time) and labour cost (hours × rate) are <i>estimates</i>. None of them is a chip measurement.</li><li><b>Unavailable hardware measurements:</b> silicon area, transistor count, physical clock behavior, measured power, real cache latency, branch predictor behavior and commercial implementation costs are not measured or inferred.</li></ol><p><b>Cache and pipeline scope:</b> set-associative (or direct-mapped) data cache with LRU/FIFO/seeded-random replacement, write-back or write-through; instruction fetches excluded; AMAT uses the single-level formula. Five-stage single-issue in-order pipeline for MIPS32 and RV32I with optional EX/MEM and MEM/WB forwarding, load-use stalls and a fixed branch penalty; no speculative execution, branch prediction or structural hazards. SUBLEQ looped array sum is explicitly an indirect-address extension; base SUBLEQ remains the unrolled baseline.</p><p><b>References:</b> S1 RISC-V International, <i>The RISC-V Instruction Set Manual, Volume I: Unprivileged Architecture</i>, document v20260120 (January 2026), <a href="https://docs.riscv.org/reference/isa/v20260120/unpriv/rv32.html">official specification</a>; RV32I base ISA module v2.1. S2/S3 MIPS32 Architecture for Programmers, Vol. I/II. S4 Intel 64 and IA-32 Architectures Software Developer’s Manuals. S5 SUBLEQ semantics and the explicitly stated simulator extension.</p>`;
}
