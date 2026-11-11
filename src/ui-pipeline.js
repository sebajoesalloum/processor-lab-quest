/* Interactive pipeline explanation component (Feature 1).
   Reusable: the Execution Simulator (pipeline timing mode) and Professor Demo experiment 2
   each create one or more instances. All numbers come from explainPipeline(), which runs on
   the interpreter's own trace. */
const PX = {};
const PX_DEMOS = {
  chain: {
    name: 'Hazard demo: ALU → ALU dependency chain',
    mem: {},
    rv: ['addi t0,zero,5', 'add t1,t0,t0', 'sub t2,t1,t0', 'add t3,t2,t1', 'sw t3,12(a0)'],
    mips: ['addiu $t0,$zero,5', 'addu $t1,$t0,$t0', 'subu $t2,$t1,$t0', 'addu $t3,$t2,$t1', 'sw $t3,12($a0)'],
    note: 'Each instruction needs the result of the one before it. With forwarding every dependency is served from a pipeline register; without it each costs two stall cycles.',
  },
  loaduse: {
    name: 'Hazard demo: load-use',
    mem: { 0: 7, 1: 5 },
    rv: ['lw t0,0(a0)', 'add t1,t0,t0', 'lw t2,4(a0)', 'sub t3,t1,t2', 'sw t3,12(a0)'],
    mips: ['lw $t0,0($a0)', 'addu $t1,$t0,$t0', 'lw $t2,4($a0)', 'subu $t3,$t1,$t2', 'sw $t3,12($a0)'],
    note: 'A loaded value exists only at the end of MEM, so the very next instruction cannot use it in EX even with forwarding: one bubble remains.',
  },
  branch: {
    name: 'Hazard demo: loop with a branch',
    mem: {},
    rv: ['addi t0,zero,3', 'loop: add t1,t1,t0', 'addi t0,t0,-1', 'bne t0,zero,loop', 'sw t1,12(a0)'],
    mips: ['addiu $t0,$zero,3', 'loop: addu $t1,$t1,$t0', 'addiu $t0,$t0,-1', 'bne $t0,$zero,loop', 'sw $t1,12($a0)'],
    note: 'The branch outcome is known only in EX. The branch penalty models the fetch slots lost until then.',
  },
  ideal: {
    name: 'Ideal: five independent instructions',
    mem: {},
    rv: ['addi t0,zero,1', 'addi t1,zero,2', 'addi t2,zero,3', 'addi t3,zero,4', 'addi t4,zero,5'],
    mips: ['addiu $t0,$zero,1', 'addiu $t1,$zero,2', 'addiu $t2,$zero,3', 'addiu $t3,$zero,4', 'addiu $t4,$zero,5'],
    note: 'No dependencies and no branches: after the 4-cycle fill, one instruction completes every cycle. 5 instructions take 5 + 4 = 9 cycles.',
  },
};
const PX_STATE_LABEL = { active: '', stall: 'stalled', hold: 'held', bubble: 'bubble', flush: 'flushed', empty: '' };
const PX_STAGE_DOES = {
  IF: 'fetches the instruction at PC and computes PC + 4',
  ID: 'decodes it and reads its source registers',
  EX: 'runs the ALU (arithmetic, address calculation or branch comparison)',
  MEM: 'reads or writes data memory (loads and stores only)',
  WB: 'writes the result into the register file',
};
function pxCreate(key, cfg) {
  const old = PX[key];
  PX[key] = {
    key,
    arch: cfg.arch || old?.arch || 'rv',
    source: cfg.source || old?.source || 'workload',
    workload: cfg.workload || old?.workload || 'ADD',
    custom: cfg.custom ?? old?.custom ?? PX_DEMOS.loaduse.rv.join('\n'),
    customMem: cfg.customMem ?? old?.customMem ?? '0:7,1:5',
    forwarding: cfg.forwarding ?? old?.forwarding ?? true,
    penalty: cfg.penalty ?? old?.penalty ?? 2,
    policy: cfg.policy ?? old?.policy ?? 'every',
    mhz: cfg.mhz ?? old?.mhz ?? 100,
    cycle: 0,
    timer: null,
    fixed: !!cfg.fixed /* demo instances: program and options locked */,
    showControls: cfg.showControls !== false,
    onChange: cfg.onChange || null,
    title: cfg.title || '',
    lockWorkload: !!cfg.lockWorkload,
  };
  pxCompute(key);
  return PX[key];
}
function pxProgram(st) {
  if (st.source === 'workload') {
    const w = W_(st.workload);
    return { lines: PROG[w.p][st.arch], mem: w.mem, label: w.n + ' workload', note: '' };
  }
  if (st.source === 'custom') {
    const mem = {};
    for (const pair of String(st.customMem).split(',')) {
      if (!pair.trim()) continue;
      const m = pair.trim().match(/^(\d+)\s*:\s*(-?\d+)$/);
      if (!m || +m[1] > 15) throw Error('Starting memory must look like 0:7,1:5 with cells 0–15.');
      mem[+m[1]] = +m[2];
    }
    return { lines: String(st.custom).split('\n'), mem, label: 'Custom program', note: '' };
  }
  const d = PX_DEMOS[st.source];
  return { lines: d[st.arch], mem: d.mem, label: d.name, note: d.note };
}
function pxCompute(key) {
  const st = PX[key];
  st.error = '';
  try {
    const prog = pxProgram(st);
    const s = mk(st.arch, { mem: prog.mem }, prog.lines);
    while (!s.halt) step(s);
    if (s.err) throw Error('Interpreter: ' + s.err);
    const opts = { arch: st.arch, forwarding: st.forwarding, branchPenalty: st.penalty, branchPolicy: st.policy, clockMHz: st.mhz };
    st.prog = prog;
    st.state = s;
    st.res = explainPipeline(s.tr, opts);
    st.other = explainPipeline(s.tr, { ...opts, forwarding: !st.forwarding });
    st.cycle = Math.min(st.cycle, st.res.cycles);
  } catch (e) {
    st.error = String(e.message || e);
    st.res = null;
  }
}
function pxSet(key, field, value) {
  const st = PX[key];
  pxPause(key);
  if (field === 'penalty') value = Math.max(0, Math.min(10, Math.round(Number(value)) || 0));
  if (field === 'mhz') {
    value = Number(value);
    if (!Number.isFinite(value) || value <= 0 || value > 100000) {
      pxMsg(key, 'Clock frequency must be between 0.001 and 100000 MHz.');
      return;
    }
  }
  st[field] = value;
  if (field === 'source' || field === 'arch' || field === 'workload') st.cycle = 0;
  pxCompute(key);
  pxDraw(key);
  if (st.onChange) st.onChange(st);
}
function pxMsg(key, text) {
  const el = document.getElementById(key + '-msg');
  if (el) el.textContent = text;
}
function pxStep(key, d) {
  const st = PX[key];
  if (!st.res) return;
  st.cycle = Math.max(0, Math.min(st.res.cycles, st.cycle + d));
  pxDraw(key);
}
function pxGoto(key, c) {
  const st = PX[key];
  if (!st.res) return;
  pxPause(key);
  st.cycle = Math.max(0, Math.min(st.res.cycles, c));
  pxDraw(key);
}
function pxPlay(key) {
  const st = PX[key];
  if (!st.res || st.timer) return;
  if (st.cycle >= st.res.cycles) st.cycle = 0;
  st.timer = setInterval(() => {
    if (!document.getElementById(key)) return pxPause(key);
    if (st.cycle >= st.res.cycles) return pxPause(key, true);
    st.cycle++;
    pxDraw(key);
  }, 1100);
  pxDraw(key);
}
function pxPause(key, redraw) {
  const st = PX[key];
  if (!st) return;
  clearInterval(st.timer);
  st.timer = null;
  if (redraw) pxDraw(key);
}
function pxStopAll() {
  Object.keys(PX).forEach((k) => pxPause(k));
}
function pxReset(key) {
  pxPause(key);
  PX[key].cycle = 0;
  pxDraw(key);
}
const PX_RV_NAME = Object.fromEntries(Object.entries(RV_ALIAS).map(([k, v]) => [v, k]));
const pxReg = (st, r) => {
  if (!r) return '';
  if (st.arch === 'rv') {
    const n = Number(String(r).slice(1));
    return (PX_RV_NAME[n] || r) + ' (x' + n + ')';
  }
  return '$' + r;
};
const pxIns = (st, i) => (i == null || i < 0 ? '' : st.res.rows[i].assembly.replace(/^[A-Za-z_]\w*:\s*/, ''));
function pxStageText(st, stage, sl) {
  const r = st.res;
  if (!sl || sl.row == null) {
    if (sl?.state === 'bubble' && sl.cause === 'stall')
      return `bubble (nop) inserted because <code>${esc(pxIns(st, sl.by))}</code> is stalled in ID`;
    if (sl?.state === 'bubble' && sl.cause === 'branch')
      return `empty slot: fetch waits for <code>${esc(pxIns(st, sl.by))}</code> to resolve (branch penalty)`;
    if (sl?.state === 'flush')
      return `flushed: a wrong-path instruction fetched after the taken branch <code>${esc(pxIns(st, sl.by))}</code> is discarded`;
    return sl?.cause === 'fill' ? 'empty (pipeline still filling)' : 'empty (pipeline draining)';
  }
  const row = r.rows[sl.row],
    t = st.state.tr[sl.row],
    ins = `<code>${esc(pxIns(st, sl.row))}</code>`;
  let d;
  try {
    d = describeInstruction(st.arch, t, st.state.p[t.pc]);
  } catch (e) {
    d = null;
  }
  if (sl.state === 'hold') return `${ins} was fetched but is held in IF because the instruction ahead of it is stalled`;
  if (sl.state === 'stall') {
    const dep = row.deps.find((x) => x.hazard && x.stallsNeeded > 0);
    return `${ins} is <b>stalled in ID</b>${dep ? `: it needs ${pxReg(st, dep.reg)} from <code>${esc(pxIns(st, dep.producer))}</code>, which is not ready yet` : ''}`;
  }
  switch (stage) {
    case 'IF':
      return `${ins} is fetched from instruction memory (PC = ${'0x' + (t.pc * 4).toString(16).toUpperCase().padStart(4, '0')})`;
    case 'ID':
      return `${ins} is decoded${row.src.filter(Boolean).length ? ' and reads ' + [...new Set(row.src.filter(Boolean))].map((x) => pxReg(st, x)).join(', ') : ''}`;
    case 'EX':
      if (!d) return ins + ' executes';
      if (d.kind === 'branch')
        return `${ins} compares ${d.alu.a} ${d.branch.cond} ${d.alu.b}: ${d.branch.taken ? '<b>taken</b>' : '<b>not taken</b>'} (branch resolved here)`;
      if (d.kind === 'load' || d.kind === 'store') return `${ins} computes the address ${d.alu.a} + ${d.alu.b} = ${d.alu.result}`;
      return `${ins} computes ${d.alu.a} ${d.alu.op} ${d.alu.b} = <b>${d.alu.result}</b>`;
    case 'MEM':
      if (d?.kind === 'load') return `${ins} reads MEM[${d.mem.address}] = <b>${d.mem.value}</b>`;
      if (d?.kind === 'store') return `${ins} writes ${d.mem.value} to MEM[${d.mem.address}]`;
      return `${ins} has no memory access; its result moves on`;
    case 'WB':
      if (d?.write && !d.write.discarded) return `${ins} writes <b>${pxReg(st, row.dst)} ← ${d.write.value}</b>`;
      return `${ins} completes (no register write)`;
  }
}
function pxCycleNarrative(st) {
  const r = st.res,
    c = st.cycle;
  if (c === 0)
    return `<p>Cycle 0: nothing has entered the pipeline. ${r.instructions} instructions from the interpreter trace will flow through IF → ID → EX → MEM → WB. Press <b>Step</b> or <b>Play</b>.</p>`;
  const T = r.timeline[c - 1];
  const items = STAGES.map((s) => `<li><b>${s}</b> ${pxStageText(st, s, T.slot[s])}</li>`).join('');
  const ev = [];
  for (const h of T.detected) {
    const p = r.rows[h.producer];
    ev.push(
      `<li class="ev-haz"><b>${h.kind === 'load-use' ? 'Load-use hazard' : 'Data hazard (RAW)'}</b>: <code>${esc(pxIns(st, h.consumer))}</code> reads ${pxReg(st, h.reg)}, written by <code>${esc(pxIns(st, h.producer))}</code> ${h.distance} instruction(s) earlier, whose write-back happens only in cycle ${p.WB}. ${
        h.forwarded
          ? h.stallsNeeded
            ? `Forwarding helps, but the loaded value exists only after MEM (cycle ${p.MEM}), so ${h.stallsNeeded} stall cycle(s) are still needed before it can be forwarded ${h.resolvedBy}.`
            : `Forwarding solves it with no stall: the value will travel ${h.resolvedBy} in cycle ${h.useCycle}.`
          : `Without forwarding the consumer must wait in ID until the producer writes back: ${h.stallsNeeded} stall cycle(s).`
      }</li>`
    );
  }
  for (const f of T.forwards)
    ev.push(
      `<li class="ev-fwd"><b>Forwarding ${esc(f.resolvedBy)}</b>: ${pxReg(st, f.reg)} = <b>${f.value}</b> from <code>${esc(pxIns(st, f.producer))}</code> to the ALU input of <code>${esc(pxIns(st, f.consumer))}</code>.</li>`
    );
  if (T.stalled >= 0) ev.push(`<li class="ev-stall"><b>Stall</b>: PC and IF/ID are frozen; a bubble enters EX.</li>`);
  if (T.branchResolve >= 0) {
    const row = r.rows[T.branchResolve];
    ev.push(
      `<li class="ev-br"><b>Branch resolved</b>: <code>${esc(row.assembly)}</code> is ${row.taken ? 'taken' : 'not taken'}. ${
        row.branchBubbles
          ? `Penalty: ${row.branchBubbles} cycle(s) ${r.branchPolicy === 'taken' ? '(wrong-path instructions are flushed)' : '(fetch waited for the outcome)'}.`
          : r.branchPolicy === 'taken'
            ? 'Not taken under the taken-only policy: the sequentially fetched instructions were correct, no penalty.'
            : 'Branch penalty is set to 0.'
      }</li>`
    );
  }
  for (const w of T.writes) ev.push(`<li class="ev-wb"><b>Write-back</b>: ${pxReg(st, w.reg)} ← ${w.value}</li>`);
  return `<p><b>Cycle ${c}</b> · completed so far: ${T.completed} of ${r.instructions}</p><ul class="px-stages">${items}</ul>${ev.length ? `<ul class="px-events">${ev.join('')}</ul>` : '<p class="sm mu">No hazard, forwarding or branch event this cycle.</p>'}`;
}
function pxStrip(st) {
  const r = st.res,
    c = st.cycle;
  const T = c ? r.timeline[c - 1] : null;
  return `<div class="px-strip" role="list" aria-label="Pipeline stages in cycle ${c}">${STAGES.map((s) => {
    const sl = T?.slot[s];
    const cls = !sl ? 'empty' : sl.row == null ? sl.state : sl.state === 'active' ? 'busy' : sl.state;
    const fwd = T && s === 'EX' && T.forwards.length;
    return `<div role="listitem" class="px-stage ${cls}${fwd ? ' fwd' : ''}"><b>${s}</b><span>${sl && sl.row != null ? esc(pxIns(st, sl.row)) : sl ? PX_STATE_LABEL[sl.state] || '—' : '—'}</span>${sl && sl.row != null && sl.state !== 'active' ? `<em>${PX_STATE_LABEL[sl.state]}</em>` : ''}</div>`;
  }).join('')}</div>`;
}
/* forwarding-path diagram: pipeline registers and the paths active this cycle */
function pxFwdSvg(st) {
  const r = st.res,
    c = st.cycle,
    T = c ? r.timeline[c - 1] : null,
    fw = T ? T.forwards : [];
  const exmem = fw.find((x) => /EX\/MEM/.test(x.resolvedBy)),
    memwb = fw.find((x) => /MEM\/WB/.test(x.resolvedBy));
  const reg = (x, label) => `<rect x="${x}" y="34" width="14" height="86" rx="3" class="px-preg"/><text x="${x + 7}" y="136" text-anchor="middle" class="px-small">${label}</text>`;
  const stage = (x, t) => `<text x="${x}" y="18" text-anchor="middle" class="px-small px-st">${t}</text>`;
  return `<svg viewBox="0 0 640 196" class="px-fwd" role="img" aria-label="Forwarding paths in cycle ${c}: ${fw.length ? fw.map((x) => x.resolvedBy + ' ' + x.value).join(', ') : 'none active'}">
${stage(50, 'IF')}${stage(165, 'ID')}${stage(300, 'EX')}${stage(440, 'MEM')}${stage(575, 'WB')}
${reg(100, 'IF/ID')}${reg(225, 'ID/EX')}${reg(370, 'EX/MEM')}${reg(510, 'MEM/WB')}
<path d="M265 52 H292 L318 64 V96 L292 108 H265 V86 L274 80 L265 74 Z" class="px-alu"/><text x="296" y="84" text-anchor="middle" class="px-small">ALU</text>
<rect x="400" y="55" width="76" height="50" rx="6" class="px-dm"/><text x="438" y="84" text-anchor="middle" class="px-small">Data mem</text>
<path d="M239 62 H265 M239 98 H265 M318 80 H370 M384 80 H400 M476 80 H510" class="px-wire"/>
<path d="M377 120 V152 H250 V100 H265" class="px-path ${exmem ? 'on' : ''}"/>
<path d="M517 120 V176 H244 V60 H265" class="px-path ${memwb ? 'on' : ''}"/>
<text x="384" y="156" class="px-small ${exmem ? 'on' : ''}">EX/MEM → EX${exmem ? ': ' + pxReg(st, exmem.reg) + ' = ' + exmem.value : ''}</text>
<text x="524" y="168" class="px-small ${memwb ? 'on' : ''}" text-anchor="start">MEM/WB → EX</text>${memwb ? `<text x="524" y="186" class="px-small on">${pxReg(st, memwb.reg) + ' = ' + memwb.value}</text>` : ''}
${!r.forwarding ? '<text x="8" y="192" class="px-small">Forwarding is OFF: both paths are disabled; operands come only from the register file.</text>' : ''}
</svg>`;
}
function pxGrid(st) {
  const r = st.res,
    c = st.cycle;
  const cellFor = (row, i, cyc) => {
    const T = r.timeline[cyc - 1];
    for (const s of STAGES) {
      const sl = T.slot[s];
      if (sl && sl.row === i) return { s, state: sl.state };
    }
    return null;
  };
  /* long programs: show a 48-cycle window around the current cycle instead of the whole diagram */
  const W = 48,
    lo = r.cycles > W ? Math.max(1, Math.min(r.cycles - W + 1, c - 12)) : 1,
    hi = Math.min(r.cycles, lo + W - 1);
  const cols = Array.from({ length: hi - lo + 1 }, (_, k) => lo + k);
  const head = cols.map((cy) => cy - 1).map((k) => `<th scope="col" class="${k + 1 === c ? 'ccur' : ''}"><button type="button" class="px-cyc" onclick="pxGoto('${st.key}',${k + 1})" aria-label="Go to cycle ${k + 1}">C${k + 1}</button></th>`).join('');
  const body = r.rows
    .map((row, i) => [row, i])
    .filter(([row]) => row.fetchStart <= hi && row.WB >= lo)
    .map(([row, i]) => {
      const done = row.WB <= c;
      return `<tr class="${done ? 'done' : ''}"><th scope="row" title="Dynamic instruction ${i + 1}">${i + 1}. <code>${esc(pxIns(st, i))}</code>${row.deps.some((d) => d.hazard) ? ' <span class="t haz" title="Has a data hazard">RAW</span>' : ''}</th>${cols.map((cy) => cy - 1).map((k) => {
        const x = cellFor(row, i, k + 1);
        if (!x) return `<td class="${k + 1 === c ? 'ccur' : ''}"></td>`;
        const fw = x.s === 'EX' && r.timeline[k].forwards.some((f) => f.consumer === i);
        const cls = ['stage', x.state === 'stall' ? 'stall' : '', x.state === 'hold' ? 'hold' : '', x.s === 'EX' && row.branch ? 'branch' : '', fw ? 'fwd' : '', k + 1 === c ? 'ccur' : ''].join(' ');
        return `<td class="${cls}">${x.state === 'stall' ? 'ID•' : x.state === 'hold' ? 'IF•' : x.s}</td>`;
      }).join('')}</tr>`;
    })
    .join('');
  return `${r.cycles > W ? `<p class="sm mu">Long program: showing cycles ${lo}–${hi} of ${r.cycles} around the current cycle (move the cycle slider to scroll).</p>` : ''}<div class="pipeline-wrap"><table class="pipeline"><thead><tr><th scope="col">Instruction (dynamic order)</th>${head}</tr></thead><tbody>${body}</tbody></table></div><p class="sm mu">Legend: <span class="lg stage">EX</span> stage · <span class="lg stall">ID•</span> stalled in ID · <span class="lg hold">IF•</span> held in IF · <span class="lg fwd">EX</span> receives a forwarded value · <span class="lg branch">EX</span> branch resolves · click a cycle number to jump.</p>`;
}
function pxPerf(st) {
  const r = st.res,
    o = st.other,
    on = r.forwarding ? r : o,
    off = r.forwarding ? o : r;
  const lastBranchTail = r.rows.length && r.rows[r.rows.length - 1].branch ? r.rows[r.rows.length - 1].branchBubbles : 0;
  const ideal = r.instructions + 4;
  const t = (x) => (x.timeNs == null ? 'set a clock' : f(x.timeNs, 1) + ' ns');
  const regsSame = JSON.stringify(on.finalRegs) === JSON.stringify(off.finalRegs);
  const verified = r.operands.length - r.operandMismatches.length;
  return `<div class="g px-perf"><div class="card"><h4>This run (${r.forwarding ? 'forwarding on' : 'forwarding off'}) ${BT}</h4><table class="kv"><tr><td>Instructions</td><td>${r.instructions}</td></tr><tr><td>Total cycles</td><td><b>${r.cycles}</b></td></tr><tr><td>Data-hazard stalls</td><td>${r.dataStalls}</td></tr><tr><td>Branch-penalty cycles</td><td>${r.branchBubbles} (${r.branchesExecuted} branch(es), ${r.branchesTaken} taken)</td></tr><tr><td>CPI</td><td><b>${f(r.cpi, 3)}</b></td></tr><tr><td>Execution time @ ${st.mhz} MHz ${BA}</td><td>${t(r)}</td></tr></table><p class="sm">Cycles = ${r.instructions} instructions + 4 fill cycles + ${r.dataStalls} stall(s) + ${r.branchBubbles - lastBranchTail} branch penalty cycle(s)${lastBranchTail ? ` (the last branch's ${lastBranchTail} penalty cycle(s) fall after the program ends)` : ''} = ${ideal + r.dataStalls + r.branchBubbles - lastBranchTail}. CPI = cycles ÷ instructions, so it includes the 4-cycle fill; for long programs CPI approaches 1 + stalls per instruction.</p></div>
<div class="card"><h4>Forwarding on vs off ${BT}</h4><table class="kv"><tr><th></th><th>Off</th><th>On</th></tr><tr><td>Cycles</td><td>${off.cycles}</td><td>${on.cycles}</td></tr><tr><td>Data stalls</td><td>${off.dataStalls}</td><td>${on.dataStalls}</td></tr><tr><td>Load-use hazards</td><td>${off.hazards.filter((h) => r.rows[h.producer].load).length}</td><td>${on.loadUseHazards}</td></tr><tr><td>CPI</td><td>${f(off.cpi, 3)}</td><td>${f(on.cpi, 3)}</td></tr><tr><td>Time</td><td>${t(off)}</td><td>${t(on)}</td></tr></table><p class="sm">${off.cycles === on.cycles ? 'Forwarding makes no difference here: no instruction needs a value before it reaches the register file.' : `Forwarding removes <b>${off.dataStalls - on.dataStalls}</b> stall cycle(s) (speed-up ${f(off.cycles / on.cycles, 2)}×). Values are taken from the EX/MEM and MEM/WB pipeline registers instead of waiting for write-back.${on.loadUseHazards ? ` ${on.loadUseHazards} load-use stall(s) remain because a loaded value is available only after MEM.` : ''}`}</p><p class="sm">${regsSame ? '<span class="ok">✓</span> Final register values are identical in both runs (timing never changes the architectural result).' : '<span class="bad">✗ Final registers differ</span>'}<br>${r.operandMismatches.length ? `<span class="bad">✗ ${r.operandMismatches.length} operand(s) would read a stale value</span>` : `<span class="ok">✓</span> All ${verified} source operands delivered by the pipeline (forwarded or from the register file) equal the interpreter's values.`}</p></div></div>`;
}
function pxHazardTable(st) {
  const r = st.res;
  if (!r.hazards.length) return '<p class="sm">No data hazards in this program: every source register was written back before it was read.</p>';
  const LIM = 60;
  return `${r.hazards.length > LIM ? `<p class="sm mu">${r.hazards.length} dependencies; the first ${LIM} are listed.</p>` : ''}<div class="sc"><table class="sm"><tr><th>Producer → consumer</th><th>Register</th><th>Type</th><th>Resolution</th><th>Stalls</th><th>Value</th></tr>${r.hazards
    .slice(0, LIM)
    .map(
      (h) =>
        `<tr><td><button type="button" class="linkish" onclick="pxGoto('${st.key}',${h.detectCycle})">#${h.producer + 1} <code>${esc(pxIns(st, h.producer))}</code> → #${h.consumer + 1} <code>${esc(pxIns(st, h.consumer))}</code></button></td><td>${pxReg(st, h.reg)}</td><td>${h.kind}</td><td>${h.forwarded ? 'forwarded ' + esc(h.resolvedBy) : h.stallsNeeded ? 'register file, after stalling' : 'register file — already written back while the instruction waited for another operand'}</td><td>${h.stallsNeeded}</td><td>${h.value}</td></tr>`
    )
    .join('')}</table></div>`;
}
function pxControls(st) {
  const k = st.key;
  const srcOpts = [['workload', 'Workload program']].concat(Object.entries(PX_DEMOS).map(([id, d]) => [id, d.name])).concat([['custom', 'Custom program']]);
  return `<div class="row">${
    st.fixed
      ? ''
      : `<label>Program <select onchange="pxSet('${k}','source',this.value)">${srcOpts.map((o) => `<option value="${o[0]}" ${o[0] === st.source ? 'selected' : ''}>${o[1]}</option>`).join('')}</select></label>${st.source === 'workload' && !st.lockWorkload ? `<label>Workload <select onchange="pxSet('${k}','workload',this.value)">${wO.map((o) => `<option value="${o[0]}" ${o[0] === st.workload ? 'selected' : ''}>${o[1]}</option>`).join('')}</select></label>` : ''}<label>ISA <select onchange="pxSet('${k}','arch',this.value)"><option value="rv" ${st.arch === 'rv' ? 'selected' : ''}>RV32I</option><option value="mips" ${st.arch === 'mips' ? 'selected' : ''}>MIPS32</option></select></label>`
  }${
    st.fixed
      ? ''
      : `<label><input type="checkbox" ${st.forwarding ? 'checked' : ''} onchange="pxSet('${k}','forwarding',this.checked)"> Forwarding</label><label>Branch penalty <input type="number" min="0" max="10" value="${st.penalty}" onchange="pxSet('${k}','penalty',this.value)" style="width:64px"> cycles</label><label>applies to <select onchange="pxSet('${k}','policy',this.value)"><option value="every" ${st.policy === 'every' ? 'selected' : ''}>every branch</option><option value="taken" ${st.policy === 'taken' ? 'selected' : ''}>taken branches only</option></select></label>`
  }<label>Clock <input type="number" min="0.001" step="any" value="${st.mhz}" onchange="pxSet('${k}','mhz',this.value)" style="width:80px"> MHz</label></div>${
    st.source === 'custom' && !st.fixed
      ? `<div class="row"><textarea id="${k}-src" rows="6" aria-label="Custom ${st.arch === 'rv' ? 'RV32I' : 'MIPS32'} program" style="width:100%;font:13px/1.5 ui-monospace,monospace">${esc(st.custom)}</textarea></div><div class="row"><label>Starting memory <input id="${k}-mem" value="${esc(st.customMem)}" style="width:200px"></label><button class="b" onclick="PX['${k}'].custom=document.getElementById('${k}-src').value;PX['${k}'].customMem=document.getElementById('${k}-mem').value;pxSet('${k}','cycle',0)">Run program</button></div>`
      : ''
  }`;
}
function pxDraw(key) {
  const st = PX[key],
    root = document.getElementById(key);
  if (!root || !st) return;
  if (!st.res) {
    root.innerHTML = `${st.showControls ? pxControls(st) : ''}<p class="bad" role="alert" id="pipe-error">Pipeline model error: ${esc(st.error)}</p>`;
    return;
  }
  const r = st.res,
    k = key;
  root.innerHTML = `${st.showControls ? pxControls(st) : ''}<p class="sm mu" id="${k}-msg" role="status"></p>${st.prog.note ? `<p class="sm">${esc(st.prog.note)}</p>` : ''}
<div class="row px-nav"><button class="b s" onclick="pxReset('${k}')" aria-label="Reset to cycle 0">⏮ Reset</button><button class="b s" onclick="pxPause('${k}');pxStep('${k}',-1)" ${st.cycle === 0 ? 'disabled' : ''}>◀ Back</button><button class="b" onclick="pxPause('${k}');pxStep('${k}',1)" ${st.cycle >= r.cycles ? 'disabled' : ''}>Step ▶</button>${st.timer ? `<button class="b s" onclick="pxPause('${k}',true)">❚❚ Pause</button>` : `<button class="b s" onclick="pxPlay('${k}')">▶ Play</button>`}<button class="b s" onclick="pxGoto('${k}',${r.cycles})">End ⏭</button><label class="sm">Cycle <input type="range" min="0" max="${r.cycles}" value="${st.cycle}" oninput="pxGoto('${k}',+this.value)" aria-label="Cycle"> <b>${st.cycle}</b> / ${r.cycles}</label></div>
${pxStrip(st)}<div class="px-explain" aria-live="polite">${pxCycleNarrative(st)}</div>${pxFwdSvg(st)}${pxGrid(st)}<h4>Hazards in this program</h4>${pxHazardTable(st)}${pxPerf(st)}`;
}
