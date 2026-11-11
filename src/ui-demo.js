/* Professor demonstration mode (Feature 4): three ready-to-run experiments. */
let DM = { exp: 1, e1: { workload: 'FIB', n: 7, ran: false, k: 0, timer: null, res: null }, e2: { ran: false }, e3: { workload: 'interleaved', ran: false } };
function dmStop() {
  clearInterval(DM.e1.timer);
  DM.e1.timer = null;
}
VIEW.demo = () =>
  `<div class="demo-head"><div><h1>Professor demonstration</h1><p class="mu">Three self-contained experiments for a live presentation. Each one runs real simulator calculations, can be stepped through, and can be reset and rerun.</p></div><button class="b s" onclick="go('sim')">← Return to the simulator</button></div><div class="row demo-tabs" role="tablist" aria-label="Experiments">${[
    [1, 'Experiment 1 · MIPS32 vs RV32I'],
    [2, 'Experiment 2 · Pipeline forwarding'],
    [3, 'Experiment 3 · Cache performance'],
  ]
    .map(([n, t]) => `<button role="tab" aria-selected="${DM.exp === n}" class="b ${DM.exp === n ? '' : 's'}" onclick="dmStop();pxStopAll();cvStopAll();DM.exp=${n};dmDraw()">${t}</button>`)
    .join('')}</div><div id="demo-body"></div>`;
POST.demo = () => dmDraw();
PLAIN.demo = lb('Pick an experiment, read the short introduction, then press <b>Run experiment</b>. Use <b>Step</b> to walk through it while you explain, and <b>Reset</b> to start again.');
function dmDraw() {
  const el = document.getElementById('demo-body');
  if (!el) return;
  document.querySelectorAll('.demo-tabs button').forEach((b, i) => {
    b.classList.toggle('s', DM.exp !== i + 1);
    b.setAttribute('aria-selected', String(DM.exp === i + 1));
  });
  el.innerHTML = DM.exp === 1 ? dm1() : DM.exp === 2 ? dm2() : dm3();
  if (DM.exp === 2 && DM.e2.ran) {
    pxDraw('demo-pA');
    pxDraw('demo-pB');
  }
  if (DM.exp === 3 && DM.e3.ran) cvDraw('demo-cache');
}
function dmExport(name, obj) {
  dl(name, JSON.stringify({ lab: VER, credit: 'Created by Student Seba Joe Salloum', generated: new Date().toISOString(), ...obj }, null, 1), 'application/json');
}
/* ---------- Experiment 1 ---------- */
function dm1Run() {
  dmStop();
  const e = DM.e1,
    msg = document.getElementById('e1-msg');
  try {
    const n = e.workload === 'MAXARR' ? null : Number(document.getElementById('e1-n')?.value ?? e.n);
    if (n != null) e.n = n;
    e.res = demoIsaComparison(e.workload, n);
    e.ran = true;
    e.k = 0;
    dmDraw();
  } catch (err) {
    if (msg) msg.textContent = String(err.message || err);
  }
}
function dm1Reset() {
  dmStop();
  DM.e1.k = 0;
  DM.e1.ran = false;
  DM.e1.res = null;
  dmDraw();
}
function dm1Step(d) {
  const e = DM.e1;
  if (!e.res) return;
  const max = Math.max(e.res.runs.mips.dynamic, e.res.runs.rv.dynamic);
  e.k = Math.max(0, Math.min(max, e.k + d));
  dmDraw();
}
function dm1Play() {
  const e = DM.e1;
  if (e.timer) {
    dmStop();
    dmDraw();
    return;
  }
  const max = Math.max(e.res.runs.mips.dynamic, e.res.runs.rv.dynamic);
  if (e.k >= max) e.k = 0;
  e.timer = setInterval(() => {
    if (!document.getElementById('e1-steps') || e.k >= max) {
      dmStop();
      if (document.getElementById('demo-body')) dmDraw();
      return;
    }
    e.k++;
    dmDraw();
  }, 700);
  dmDraw();
}
function dm1Side(r, k) {
  const done = Math.min(k, r.dynamic);
  const cur = done ? r.trace[done - 1] : null;
  const cyc = r.trace.slice(0, done).reduce((a, t) => a + t.cy, 0);
  return `<div class="card" style="border-top:4px solid ${MODELS[r.arch].col}"><h4>${r.name}</h4><pre class="prog">${r.source
    .map((l, i) => `<span class="${cur && cur.pc === i ? 'cur' : ''}">${String(i).padStart(2, ' ')}: ${esc(l)}</span>`)
    .join('')}</pre><p class="sm">${cur ? `#${done}: <code>${esc(cur.t.replace(/^[A-Za-z_]\w*:\s*/, ''))}</code> → ${esc(cur.note)}` : 'Not started'}${done >= r.dynamic && k > 0 ? ' <span class="ok">· finished</span>' : ''}</p><div class="cache-metrics"><span class="chip">executed ${done} / ${r.dynamic}</span><span class="chip">multicycle cycles so far ${cyc}</span></div></div>`;
}
function dm1() {
  const e = DM.e1;
  const intro = `<div class="card"><h2>Experiment 1 — The same algorithm on MIPS32 and RV32I</h2><p>MIPS32 and RISC-V RV32I are both load/store RISC architectures with 32 registers and fixed 32-bit instructions. They still differ in instruction formats, immediate encodings and branch instructions. This experiment runs <b>equivalent hand-written programs</b> for one workload on both interpreters and compares what was actually executed.</p><div class="row"><label>Workload <select onchange="DM.e1.workload=this.value;DM.e1.n=this.value==='FIB'?7:this.value==='SUMN'?5:null;dm1Reset()">${DEMO_ISA_WORKLOADS.map((id) => `<option value="${id}" ${id === e.workload ? 'selected' : ''}>${W_(id).n}</option>`).join('')}</select></label>${e.workload === 'MAXARR' ? '' : `<label>${e.workload === 'FIB' ? 'n (0–15)' : 'N (1–30)'} <input id="e1-n" type="number" value="${e.n}" min="${e.workload === 'FIB' ? 0 : 1}" max="${e.workload === 'FIB' ? 15 : 30}" style="width:70px"></label>`}<button class="b" onclick="dm1Run()">${e.ran ? 'Run again' : 'Run experiment'}</button><button class="b s" onclick="dm1Reset()">Reset</button></div><p id="e1-msg" class="bad sm" role="alert"></p></div>`;
  if (!e.ran) return intro + `<div class="g">${['mips', 'rv'].map((a) => `<div class="card"><h4>${MODELS[a].name}</h4><pre class="prog">${esc(PROG[W_(e.workload).p][a].join('\n'))}</pre></div>`).join('')}</div>`;
  const R = e.res,
    m = R.runs.mips,
    r = R.runs.rv,
    max = Math.max(m.dynamic, r.dynamic);
  const enc = R.encodings
    .filter((x) => x.mips || x.rv)
    .map(
      (x) =>
        `<tr><td>${x.label}</td>${['mips', 'rv']
          .map((a) =>
            x[a]
              ? `<td><code>${esc(x[a].text)}</code><br><code>${x[a].hex}</code><div class="bitbar mini">${x[a].fields.map((fl) => `<span class="bitfield" style="flex:${fl.bits};background:${fl.color}" title="${fl.label}: ${fl.value}"><b>${fl.label}</b>${fl.value}</span>`).join('')}</div></td>`
              : '<td class="mu">not used</td>'
          )
          .join('')}</tr>`
    )
    .join('');
  const D = R.differences;
  const exp = [];
  exp.push(`Both programs produce OUT = ${m.output} / ${r.output} (expected ${R.expected}) ${m.ok && r.ok ? '<span class="ok">✓ both verified</span>' : '<span class="bad">✗</span>'}.`);
  if (D.dynamicDelta)
    exp.push(`MIPS32 executes <b>${Math.abs(D.dynamicDelta)} ${D.dynamicDelta > 0 ? 'more' : 'fewer'}</b> instructions (${m.dynamic} vs ${r.dynamic}).${D.mipsOnly.length ? ` Only MIPS32 executes ${D.mipsOnly.map(([k, v]) => `<code>${k}</code> ×${v}`).join(', ')}` : ''}${D.rvOnly.length ? `; only RV32I executes ${D.rvOnly.map(([k, v]) => `<code>${k}</code> ×${v}`).join(', ')}` : ''}. ${D.mipsOnly.some(([k]) => k === 'slt') && D.rvOnly.some(([k]) => ['bge', 'blt'].includes(k)) ? 'MIPS32 has only beq/bne, so a “less than” test needs <code>slt</code> to compute a 0/1 flag into a register and then a branch on it; RV32I compares two registers directly with <code>blt</code>/<code>bge</code>, one instruction.' : ''}`);
  else exp.push(`Both execute ${m.dynamic} instructions.`);
  exp.push(`Cycles depend on the timing model, not only on the instruction count. With the lab's multicycle cost assumptions (load ${m.costs.ld}, store ${m.costs.st}, ALU ${m.costs.alu}, branch ${m.costs.br} cycles, identical for both ISAs) MIPS32 needs ${m.multiCycles} and RV32I ${r.multiCycles} cycles. In the five-stage pipeline (forwarding on, branch penalty ${DEMO_PIPE.branchPenalty} on every branch) they need ${m.pipeCycles} and ${r.pipeCycles} cycles: RV32I ${r.pipeCycles < m.pipeCycles ? 'saves' : 'spends'} ${Math.abs(m.pipeCycles - r.pipeCycles)} cycle(s)${(r.pipeCycles < m.pipeCycles) === (r.pipeCPI > m.pipeCPI) ? ', even though its CPI is ' + (r.pipeCPI > m.pipeCPI ? 'higher' : 'lower') + ' (' + f(r.pipeCPI, 3) + ' vs ' + f(m.pipeCPI, 3) + '): CPI divides cycles by the instruction count, and the two programs have different instruction counts but ' + (r.pipeBranchBubbles === m.pipeBranchBubbles ? 'the same number of branch-penalty cycles (' + r.pipeBranchBubbles + ')' : r.pipeBranchBubbles + ' vs ' + m.pipeBranchBubbles + ' branch-penalty cycles') + '. Total cycles, not CPI, decide execution time' : ''}.`);
  exp.push(`Encoding: MIPS32 I-type instructions carry a 16-bit immediate in one field; RV32I splits immediates differently per format (12-bit I and S, 13-bit B with bit 0 implied, 20-bit U), and its store and branch immediates are split across two fields so that rs1/rs2/rd always sit in the same bit positions. Branch offsets: MIPS32 counts words from PC+4; RV32I counts bytes from the branch itself.`);
  exp.push(`Code size: ${m.staticCount} vs ${r.staticCount} instructions = ${m.codeBytes} vs ${r.codeBytes} bytes (both fixed 4-byte instructions).`);
  exp.push('These are equivalent hand-written programs for teaching subsets. They do not rank the two ISAs in general, and no compiler or real chip was measured.');
  return (
    intro +
    `<div class="card"><h3>Step-by-step execution (both interpreters in lock-step)</h3><div class="row" id="e1-steps"><button class="b s" onclick="dmStop();dm1Step(-${max})">⏮ Reset steps</button><button class="b s" onclick="dmStop();dm1Step(-1)" ${e.k === 0 ? 'disabled' : ''}>◀ Back</button><button class="b" onclick="dmStop();dm1Step(1)" ${e.k >= max ? 'disabled' : ''}>Step ▶</button><button class="b s" onclick="dm1Play()">${e.timer ? '❚❚ Pause' : '▶ Play'}</button><button class="b s" onclick="dmStop();dm1Step(${max})">End ⏭</button><span class="sm">dynamic step <b>${e.k}</b> / ${max}</span></div><div class="g">${dm1Side(m, e.k)}${dm1Side(r, e.k)}</div></div>
<div class="card sc"><h3>Results ${BT}${BA}</h3><table><tr><th>Metric</th><th>${m.name}</th><th>${r.name}</th><th>Kind</th></tr><tr><td>Static instructions</td><td>${m.staticCount}</td><td>${r.staticCount}</td><td>${BT}</td></tr><tr><td>Dynamic instructions</td><td>${m.dynamic}</td><td>${r.dynamic}</td><td>${BT}</td></tr><tr><td>Multicycle cycles · CPI</td><td>${m.multiCycles} · ${f(m.multiCPI, 3)}</td><td>${r.multiCycles} · ${f(r.multiCPI, 3)}</td><td>${BC}</td></tr><tr><td>5-stage pipeline cycles · CPI</td><td>${m.pipeCycles} · ${f(m.pipeCPI, 3)}</td><td>${r.pipeCycles} · ${f(r.pipeCPI, 3)}</td><td>${BC}</td></tr><tr><td>Pipeline data stalls / branch-penalty cycles</td><td>${m.pipeStalls} / ${m.pipeBranchBubbles}</td><td>${r.pipeStalls} / ${r.pipeBranchBubbles}</td><td>${BC}</td></tr><tr><td>Code size</td><td>${m.codeBytes} B</td><td>${r.codeBytes} B</td><td>${BT}</td></tr><tr><td>Executed instruction mix</td><td>${Object.entries(m.histogram).map(([k, v]) => k + '×' + v).join(' ')}</td><td>${Object.entries(r.histogram).map(([k, v]) => k + '×' + v).join(' ')}</td><td>${BT}</td></tr><tr><td>Final non-zero registers</td><td>${m.registers.map((x) => esc(x.label) + '=' + x.value).join(', ')}</td><td>${r.registers.map((x) => esc(x.label) + '=' + x.value).join(', ')}</td><td>${BT}</td></tr><tr><td>Output (cell 3)</td><td>${m.output} ${m.ok ? '<span class="ok">✓</span>' : '<span class="bad">✗</span>'}</td><td>${r.output} ${r.ok ? '<span class="ok">✓</span>' : '<span class="bad">✗</span>'}</td><td>${BT}</td></tr></table><p class="sm mu">Register sets differ in naming: MIPS32 $t0–$t3 are registers 8–11; RV32I t0–t2 are x5–x7 and t3–t4 are x28–x29. Both hard-wire register 0 to zero.</p></div>
<div class="card sc"><h3>Encoding differences ${BI}</h3><table class="sm"><tr><th>Kind</th><th>${m.name}</th><th>${r.name}</th></tr>${enc}</table></div>
<div class="card"><h3>Explanation</h3><ul>${exp.map((x) => `<li>${x}</li>`).join('')}</ul><div class="row"><button class="b s" onclick="dmExport('experiment1-mips-vs-rv32i.json',dm1ExportData())">Export results (JSON)</button></div></div>`
  );
}
function dm1ExportData() {
  const R = DM.e1.res;
  return {
    experiment: 'MIPS32 vs RV32I',
    workload: R.workload,
    n: R.n,
    expected: R.expected,
    runs: Object.fromEntries(
      ['mips', 'rv'].map((a) => {
        const x = R.runs[a];
        return [a, { static: x.staticCount, dynamic: x.dynamic, cycle_costs: x.costs, multicycle_cycles: x.multiCycles, multicycle_cpi: x.multiCPI, pipeline_cycles: x.pipeCycles, pipeline_cpi: x.pipeCPI, pipeline_settings: { forwarding: true, ...DEMO_PIPE, arch: a }, mix: x.histogram, output: x.output, ok: x.ok, registers: x.registers }];
      })
    ),
    encodings: R.encodings.map((e) => ({ kind: e.label, mips: e.mips && { text: e.mips.text, hex: e.mips.hex }, rv: e.rv && { text: e.rv.text, hex: e.rv.hex } })),
  };
}
/* ---------- Experiment 2 ---------- */
function dm2Run() {
  DM.e2.res = demoForwarding(2);
  DM.e2.ran = true;
  const common = { arch: 'rv', source: 'custom', custom: DEMO_FWD_PROGRAM.rv.join('\n'), customMem: '0:7,1:5', penalty: 2, policy: 'every', mhz: 100, fixed: true };
  pxCreate('demo-pA', { ...common, forwarding: false });
  pxCreate('demo-pB', { ...common, forwarding: true });
  dmDraw();
}
function dm2Reset() {
  pxStopAll();
  if (PX['demo-pA']) PX['demo-pA'].cycle = 0;
  if (PX['demo-pB']) PX['demo-pB'].cycle = 0;
  DM.e2.ran = false;
  dmDraw();
}
function dm2() {
  const intro = `<div class="card"><h2>Experiment 2 — Data forwarding in a five-stage pipeline</h2><p>The same six RV32I instructions run twice through the IF-ID-EX-MEM-WB pipeline. <b>Run A</b> has no forwarding: a dependent instruction waits in ID until its producer has written the register file. <b>Run B</b> forwards results from the EX/MEM and MEM/WB pipeline registers straight to the ALU. A load followed immediately by a use still costs one bubble, because the loaded value does not exist until the end of MEM.</p><pre class="prog">${DEMO_FWD_PROGRAM.rv.map((l, i) => `${i + 1}. ${esc(l)}`).join('\n')}</pre><p class="sm">Starting memory: word 0 = 7, word 1 = 5. Expected result: t4 = (7 + 7 − 7) + 5 = 12, stored to word 3. Branch penalty is irrelevant here (no branches).</p><div class="row"><button class="b" onclick="dm2Run()">${DM.e2.ran ? 'Run again' : 'Run experiment'}</button><button class="b s" onclick="dm2Reset()">Reset</button></div></div>`;
  if (!DM.e2.ran) return intro;
  const R = DM.e2.res,
    A = R.A,
    B = R.B;
  const mx = Math.max(A.cycles, B.cycles);
  const bar = (label, v, cls) => `<div class="hbar"><span>${label}</span><div><i class="${cls}" style="width:${(v / mx) * 100}%"></i></div><b>${v}</b></div>`;
  const hz = B.hazards
    .map((h) => {
      const a = A.hazards.find((x) => x.consumer === h.consumer && x.reg === h.reg);
      return `<tr><td>#${h.producer + 1} → #${h.consumer + 1}</td><td>${PX_RV_NAME[Number(h.reg.slice(1))]}</td><td>${a ? a.stallsNeeded + ' stall(s), register file' : '—'}</td><td>${h.stallsNeeded ? h.stallsNeeded + ' stall(s), then ' : ''}${h.forwarded ? 'forwarded ' + esc(h.resolvedBy) : 'register file'}${h.kind === 'load-use' ? ' (load-use)' : ''}</td><td>${h.value}</td></tr>`;
    })
    .join('');
  return (
    intro +
    `<div class="card"><h3>Run A — forwarding disabled</h3><div id="demo-pA"></div></div><div class="card"><h3>Run B — forwarding enabled</h3><div id="demo-pB"></div></div>
<div class="card"><h3>Comparison ${BC}</h3><div class="hbars">${bar('A: no forwarding', A.cycles, 'a')}${bar('B: forwarding', B.cycles, 'b')}</div><table class="sm"><tr><th></th><th>Run A (off)</th><th>Run B (on)</th></tr><tr><td>Total cycles</td><td>${A.cycles}</td><td>${B.cycles}</td></tr><tr><td>Data-hazard stall cycles</td><td>${A.dataStalls}</td><td>${B.dataStalls}</td></tr><tr><td>CPI</td><td>${f(A.cpi, 3)}</td><td>${f(B.cpi, 3)}</td></tr><tr><td>Time at 100 MHz ${BA}</td><td>${f(A.timeNs, 0)} ns</td><td>${f(B.timeNs, 0)} ns</td></tr><tr><td>Forwarded operands</td><td>0</td><td>${B.forwardedOperands}</td></tr></table><h4>Every dependency and how it was resolved</h4><div class="sc"><table class="sm"><tr><th>Producer → consumer</th><th>Register</th><th>Run A</th><th>Run B</th><th>Value</th></tr>${hz}</table></div>
<h4>Explanation</h4><ul><li>Forwarding saves <b>${R.saved}</b> of ${A.cycles} cycles (speed-up ${f(R.speedup, 2)}×). Cycles = 6 instructions + 4 fill cycles + stalls: A = 10 + ${A.dataStalls}, B = 10 + ${B.dataStalls}.</li><li>Without forwarding each back-to-back dependency costs 2 stalls: the consumer may read the register file only in the cycle the producer writes it (write in the first half, read in the second).</li><li>With forwarding, ALU results reach the next instruction from EX/MEM and older results from MEM/WB, so ALU→ALU dependencies cost nothing. The ${B.loadUseHazards} load-use dependencies (<code>lw</code> immediately followed by a use) still cost 1 stall each.</li><li>${R.sameRegisters ? '<span class="ok">✓</span> Both runs end with identical register values and the stored result ' + R.output + (R.ok ? ' (correct)' : '') + '.' : '<span class="bad">✗ registers differ</span>'} ${A.operandMismatches.length + B.operandMismatches.length === 0 ? '<span class="ok">✓</span> In both runs every operand the pipeline delivers equals the interpreter value.' : '<span class="bad">✗ stale operand detected</span>'}</li></ul><div class="row"><button class="b s" onclick="dmExport('experiment2-forwarding.json',dm2ExportData())">Export results (JSON)</button></div></div>`
  );
}
function dm2ExportData() {
  const R = DM.e2.res;
  const pick = (x) => ({ forwarding: x.forwarding, cycles: x.cycles, instructions: x.instructions, data_stalls: x.dataStalls, branch_bubbles: x.branchBubbles, cpi: x.cpi, time_ns_at_100mhz: x.timeNs, hazards: x.hazards.map((h) => ({ producer: h.producer + 1, consumer: h.consumer + 1, register: h.reg, kind: h.kind, stalls: h.stallsNeeded, resolved_by: h.resolvedBy, value: h.value })), schedule: x.rows.map((r) => ({ instruction: r.assembly, IF: r.IF, ID: r.ID, EX: r.EX, MEM: r.MEM, WB: r.WB, stalls: r.stalls })) });
  return { experiment: 'Pipeline forwarding', program: R.program, output: R.output, runA: pick(R.A), runB: pick(R.B), cycles_saved: R.saved, speedup: R.speedup, identical_final_registers: R.sameRegisters };
}
/* ---------- Experiment 3 ---------- */
function dm3Run() {
  const R = demoCache(DM.e3.workload);
  DM.e3.res = R;
  DM.e3.ran = true;
  cvCreate('demo-cache', { accesses: R.accesses, configs: R.configs, editable: false, sourceLabel: R.name });
  dmDraw();
}
function dm3Reset() {
  cvStopAll();
  DM.e3.ran = false;
  dmDraw();
}
function dm3() {
  const e = DM.e3;
  const intro = `<div class="card"><h2>Experiment 3 — Cache performance under different configurations</h2><p>One fixed sequence of data addresses is replayed through three caches that differ in exactly one property at a time: <b>A</b> 64-byte direct-mapped, <b>B</b> 64-byte 2-way set-associative (LRU), <b>C</b> 128-byte direct-mapped. All use 16-byte blocks, a 1-cycle hit time and a 20-cycle miss penalty ${BA}.</p><div class="row"><label>Workload <select onchange="DM.e3.workload=this.value;dm3Reset()">${Object.entries(DEMO_CACHE_WORKLOADS).map(([k, w]) => `<option value="${k}" ${k === e.workload ? 'selected' : ''}>${esc(w.name)}</option>`).join('')}</select></label><button class="b" onclick="dm3Run()">${e.ran ? 'Run again' : 'Run experiment'}</button><button class="b s" onclick="dm3Reset()">Reset</button></div></div>`;
  if (!e.ran) return intro;
  const R = e.res,
    [a, b, c] = R.results;
  const ex = [];
  if (e.workload === 'interleaved') {
    ex.push(`In A, word A[i] (address 4i) and B[i] (address 64 + 4i) fall in blocks that are exactly 4 blocks apart, and A has only 4 lines, so they always select the same line and evict each other: <b>${a.hits} hits, ${a.misses} misses</b>, of which ${a.missBreakdown.conflict} are conflict misses.`);
    ex.push(`B keeps the same 64 bytes but organises them as 2 sets × 2 ways, so both blocks fit in one set: only the ${b.missBreakdown.compulsory} compulsory misses remain (hit rate ${f(b.hitRate * 100, 1)}%).`);
    ex.push(`C removes the conflict differently: with 8 lines the two arrays map to different lines. Same misses as B (${c.misses}) but twice the storage.`);
  } else {
    ex.push(`The array is 96 bytes (6 blocks), larger than the 64-byte caches. In A the second pass finds only some blocks still cached: ${a.missBreakdown.capacity} capacity misses.`);
    ex.push(`B (2-way LRU) is <b>worse</b> here (${b.misses} vs ${a.misses} misses): a sequential scan larger than the cache makes LRU evict exactly the block that will be needed next. Associativity removes conflict misses, not capacity misses.`);
    ex.push(`C holds all 6 blocks, so the second pass hits completely: only the ${c.missBreakdown.compulsory} compulsory misses remain.`);
  }
  ex.push(`AMAT = 1 + miss rate × 20: A ${f(a.amat, 2)}, B ${f(b.amat, 2)}, C ${f(c.amat, 2)} cycles. Instruction fetches are not included; the numbers are model results, not measurements of a real cache.`);
  return (
    intro +
    `<div class="card"><h3>Access pattern</h3><div class="mstrip">${R.accesses.map((x, i) => `<span class="mb sm" title="access ${i + 1}">${x.address}</span>`).join('')}</div><p class="sm mu">${R.accesses.length} reads, byte addresses in order.</p></div><div id="demo-cache"></div><div class="card"><h3>Explanation</h3><ul>${ex.map((x) => `<li>${x}</li>`).join('')}</ul><div class="row"><button class="b s" onclick="dmExport('experiment3-cache.json',dm3ExportData())">Export results (JSON)</button></div></div>`
  );
}
function dm3ExportData() {
  const R = DM.e3.res;
  return {
    experiment: 'Cache performance',
    workload: R.name,
    accesses: R.accesses.map((a) => a.address),
    configurations: R.configs.map((cfg, i) => {
      const r = R.results[i];
      return { config: cfg, hits: r.hits, misses: r.misses, hit_rate: r.hitRate, miss_rate: r.missRate, amat_cycles: r.amat, miss_breakdown: r.missBreakdown, writebacks: r.writebacks };
    }),
  };
}
