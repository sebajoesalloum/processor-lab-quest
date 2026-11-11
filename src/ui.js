const met = (id, w) => {
  const r = run(id, w),
    M = MODELS[id],
    cyc = Object.entries(r.cls).reduce((a, [k, v]) => a + v * (M.cyc[k] || 0), 0),
    t = (cyc * 1000) / S.mhz,
    cache = simulateCache(r.accesses, S.cache);
  return {
    ...r,
    cyc,
    cpi: cyc / r.dyn,
    t,
    e: M.pw * t,
    pw: M.pw,
    hrs: M.hrs,
    lab: M.hrs * S.rate,
    mem: r.rd + r.wr,
    fb: r.fp * 4,
    cache,
    cacheHits: cache.hits,
    cacheMisses: cache.misses,
    cacheMissRate: cache.missRate,
    amat: cache.amat,
    pipeCycles: pipeFor(id, w)?.cycles ?? null,
    pipeCPI: pipeFor(id, w)?.cpi ?? null,
  };
};
const f = (v, d = 2) => (v == null || !Number.isFinite(v) ? 'Not available' : (+v.toFixed(d)).toString()),
  B = (k, t) => `<span class="t ${k}">${t}</span>`,
  BI = B('isa', 'ISA fact'),
  BT = B('tr', 'Simulated'),
  BC = B('ca', 'Calculated'),
  BA = B('as', 'Assumption'),
  BE = B('es', 'Estimate'),
  BN = B('na', 'Not measured');
const W_ = (id) => WL.find((w) => w.id == id),
  $ = (s) => document.querySelector(s),
  ids = Object.keys(MODELS),
  CC = {
    load: '#3730A3',
    store: '#6366F1',
    arith: '#A855F7',
    branch: '#D8B4FE',
    'sub+branch': '#4F46E5',
    move: '#C4B5FD',
  };
const TABS = [
  ['over', 'Overview'],
  ['build', 'Processor Construction'],
  ['oisc', 'OISC Lesson'],
  ['mod', 'Processor Models'],
  ['exp', 'Instruction Explorer'],
  ['sim', 'Execution Simulator'],
  ['cache', 'Cache Lab'],
  ['bench', 'Benchmarks'],
  ['sbx', 'Program Sandbox'],
  ['cmp', 'Compare & Reports'],
  ['demo', 'Professor Demo'],
];
$('#nav').innerHTML = TABS.map(
  (t, i) =>
    `<button type="button" role="tab" id="tab-${t[0]}" aria-controls="v" aria-selected="${i === 0}" tabindex="${i === 0 ? 0 : -1}" data-t="${t[0]}" onclick="go('${t[0]}')">${t[1]}</button>`
).join('');
$('#nav').addEventListener('keydown', (e) => {
  if (!['ArrowRight', 'ArrowLeft', 'Home', 'End'].includes(e.key)) return;
  const tabs = [...$('#nav').querySelectorAll('[role=tab]')],
    i = tabs.indexOf(document.activeElement);
  let n =
    e.key === 'Home'
      ? 0
      : e.key === 'End'
        ? tabs.length - 1
        : (i + (e.key === 'ArrowRight' ? 1 : -1) + tabs.length) % tabs.length;
  e.preventDefault();
  tabs[n].focus();
  go(tabs[n].dataset.t);
});
let T = '';
function go(t) {
  T = t;
  document.querySelectorAll('nav button').forEach((b) => {
    const active = b.dataset.t == t;
    b.classList.toggle('on', active);
    b.setAttribute('aria-selected', String(active));
    b.tabIndex = active ? 0 : -1;
  });
  simStop();
  dpStop();
  pxStopAll();
  cvStopAll();
  dmStop();
  $('#v').innerHTML = (PLAIN[t] || '') + VIEW[t]() + (PRO[t] || '') + (QZ[t] ? qz(t) : '') + GLOSS;
  if (POST[t]) POST[t]();
  scrollTo(0, 0);
}
const sel = (id, opts, cur, fn) =>
  `<select id="${id}" onchange="${fn}(this.value)">${opts.map((o) => `<option value="${o[0]}"${o[0] == cur ? ' selected' : ''}>${o[1]}</option>`).join('')}</select>`;
const mO = ids.map((i) => [i, MODELS[i].name]),
  wO = WL.map((w) => [w.id, w.n]);
const memV = (s, ch = []) =>
  s.m
    .map(
      (v, i) =>
        `<span class="cell${ch.includes(i) ? ' ch' : ''}"><small>[${i}]${Object.keys(NAMES)
          .filter((k) => NAMES[k] == i && k != 'N')
          .join('/')}</small>${v}</span>`
    )
    .join('');
const demo = (a, b, c) => {
  const s = mk('sq', { mem: { 0: a, 1: b } }, ['SUBLEQ A,B,' + c]),
    b0 = s.m.slice();
  step(s);
  return { s, b0, r: s.m[1], tk: s.pc == c && s.m[1] <= 0 };
};
/* intro video: the MP4 is embedded (base64) by build.js so the app stays a single offline file */
let iUrl = null;
function iLoad() {
  const v = $('#introv');
  if (iUrl) return v;
  try {
    const bin = atob($('#intro-video-b64').textContent.trim());
    const bytes = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
    iUrl = URL.createObjectURL(new Blob([bytes], { type: 'video/mp4' }));
    v.src = iUrl;
    v.addEventListener('play', iSync);
    v.addEventListener('pause', iSync);
    v.addEventListener('volumechange', iSync);
    v.addEventListener('ended', iSkip);
    v.addEventListener('error', iSkip);
  } catch (e) {
    iSkip();
  }
  return v;
}
function iSync() {
  const v = $('#introv');
  $('#ip').textContent = v.paused ? 'Play' : 'Pause';
  $('#isnd').textContent = v.muted ? 'Sound on' : 'Mute';
}
function iPlay() {
  const v = iLoad();
  v.currentTime = 0;
  v.muted = false;
  $('#intro-msg').textContent = '';
  const p = v.play();
  if (p && p.catch)
    p.catch(() => {
      /* Browsers block autoplay with sound until the page has been clicked: fall back to muted playback. */
      v.muted = true;
      $('#intro-msg').textContent = 'Playing without sound. Press "Sound on" to hear it.';
      const q = v.play();
      if (q && q.catch) q.catch(() => ($('#intro-msg').textContent = 'Press Play to start the video.'));
    });
}
function iRe() {
  if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
    const v = iLoad();
    v.pause();
    v.currentTime = 0;
    $('#intro').style.display = 'none';
    return;
  }
  iPlay();
}
function iPause() {
  const v = iLoad();
  if (v.paused) v.play().catch(() => {});
  else v.pause();
}
function iSound() {
  const v = iLoad();
  v.muted = !v.muted;
  $('#intro-msg').textContent = '';
  if (v.paused && !v.ended) v.play().catch(() => {});
}
function iSkip() {
  if (iUrl) $('#introv').pause();
  $('#intro').style.display = 'none';
  go('cmp');
}
/* views */
const VIEW = {},
  POST = {};
VIEW.over =
  () => `<h1>How do instruction sets and processor designs change the work a computer does?</h1><p class="mu">Processor Lab runs real execution engines for four educational models, checks every output, and shows where each number comes from. <b>Created by Student Seba Joe Salloum.</b></p>
<div class="row"><button class="b" onclick="pmStart()">Start guided presentation</button><button class="b s" onclick="go('cmp')">Open dashboard</button><button class="b s" onclick="iRe();$('#intro').style.display=''">Replay intro</button></div>
<div class="g"><div class="card"><h3>Every number is labelled</h3><p class="sm">${BI} documented in an architecture specification · ${BT} counted from an actual simulator run · ${BC} computed from simulated counts and stated assumptions (cycles, CPI, time, AMAT) · ${BA} an editable teaching input · ${BE} a rough figure that is not derived from a simulation (energy, labour, x86 code size) · ${BN} not available, never invented (area, transistors, measured power). Nothing in this lab is a hardware measurement.</p></div>
<div class="card"><h3>Four models, one task set</h3><p class="sm">${ids.map((i) => MODELS[i].name).join(' · ')}. Twelve workloads, including Fibonacci, array maximum, looped/unrolled array sums, and RV32I constant construction run with identical inputs and expected outputs.</p></div>
<div class="card"><h3>Scope</h3><p class="sm">Small teaching subsets, not complete commercial processors. Conclusions hold within the declared models and assumptions; there is no universal ranking of OISC, RISC and CISC designs.</p></div></div>
<h2>New in 4.0</h2><div class="g"><div class="card"><h3>Pipeline explanation</h3><p class="sm">Cycle-by-cycle IF/ID/EX/MEM/WB occupancy, hazards, forwarding paths with values, stalls and branch penalties.</p><button class="b s" onclick="TIMING='pipeline';openSim('rv','ADD')">Open</button></div><div class="card"><h3>Datapath walk-through</h3><p class="sm">Each instruction phase by phase on the datapath of the selected architecture, with real register, ALU and memory values.</p><button class="b s" onclick="TIMING='multi';openSim('mips','ADD')">Open</button></div><div class="card"><h3>Cache lab</h3><p class="sm">Set-associative caches, LRU/FIFO/random replacement, write-back/write-through, tag/index/offset and 3C miss analysis.</p><button class="b s" onclick="go('cache')">Open</button></div><div class="card"><h3>Professor demonstration</h3><p class="sm">Three ready-to-run experiments: MIPS32 vs RV32I, pipeline forwarding, cache performance.</p><button class="b s" onclick="go('demo')">Open</button></div></div><h2>Trade-offs to discuss</h2><div class="g"><div class="card"><h3>Instruction count ≠ speed</h3><p class="sm">SUBLEQ often executes fewer or similar instruction counts yet needs more cycles, because each instruction does more memory work.</p></div><div class="card"><h3>Count ≠ code size</h3><p class="sm">Fixed-width 32-bit RISC code, 12-byte SUBLEQ instructions and variable-length x86 encodings give different byte totals.</p></div><div class="card"><h3>Power ≠ energy</h3><p class="sm">Energy = assumed power × time. A lower-power design can still use more energy if it runs longer.</p></div><div class="card"><h3>Effort ≠ manufacturing cost</h3><p class="sm">Labor cost here is for building a small educational model only. Chip area, transistor counts and prices are ${BN} without an identified implementation.</p></div></div>`;
// A deliberately constrained, executable custom teaching ISA: seven opcodes, two register fields, and one immediate.
const CUSTOM_HELP = {
  MOVI: 'MOVI r0,7 — set register r0 to immediate 7',
  ADD: 'ADD r0,r1 — r0 = r0 + r1',
  SUB: 'SUB r0,r1 — r0 = r0 - r1',
  LOAD: 'LOAD r0,3 — load memory cell 3',
  STORE: 'STORE r0,3 — store r0 into memory cell 3',
  JNZ: 'JNZ r0,label — jump when r0 is not zero',
  HALT: 'HALT — end program',
};
function isaBuilderView() {
  return `<div class="card" id="isa-builder"><h2>Interactive ISA design laboratory</h2><p class="sm mu">Define a small educational instruction set, encode its instructions, and execute a real program. This is a custom teaching CPU, separate from MIPS, RV32I, x86 and SUBLEQ.</p><div class="row"><label>Registers <select id="icregs" onchange="isaBuilderRender()"><option value="4">4</option><option value="8">8</option></select></label><label>Instruction width <select id="icwidth" onchange="isaBuilderRender()"><option value="16">16 bits</option><option value="24">24 bits</option></select></label><label>Data width <select id="icdata" onchange="isaBuilderRender()"><option value="8">8 bits</option><option value="16">16 bits</option><option value="32" selected>32 bits</option></select></label></div><div id="icformat" class="sm"></div><h3>Supported instructions</h3><div class="row">${Object.entries(
    CUSTOM_OPS
  )
    .map(
      ([op, n]) =>
        `<span class="chip" title="${CUSTOM_HELP[op]}">${n.toString(2).padStart(3, '0')} ${op}</span>`
    )
    .join(
      ''
    )}</div><label for="icprogram">Custom assembly program</label><textarea id="icprogram" rows="7" style="width:100%;font:13px/1.5 ui-monospace,monospace">${CUSTOM_EXAMPLE}</textarea><div class="row"><button class="b" onclick="isaBuilderRun()">Assemble and execute</button><button class="b s" onclick="document.querySelector('#icprogram').value=CUSTOM_EXAMPLE;isaBuilderRun()">Reset example</button></div><div id="icresult" aria-live="polite"></div></div>`;
}
function isaBuilderRender() {
  const r = +$('#icregs').value,
    w = +$('#icwidth').value;
  let fm;
  try {
    fm = customFormat(r, w);
  } catch (e) {
    $('#icformat').innerHTML = `<p class="bad">${esc(e.message)}</p>`;
    $('#icresult').innerHTML = '';
    return;
  }
  const rb = fm.regBits,
    im = fm.immBits;
  $('#icformat').innerHTML =
    `<div class="bitbar" role="img" aria-label="Instruction format"><span class="bitfield" style="flex:3;background:#c4b5fd"><b>opcode</b>3 bits</span><span class="bitfield" style="flex:${rb};background:#93c5fd"><b>dest</b>${rb} bits</span><span class="bitfield" style="flex:${rb};background:#93c5fd"><b>src</b>${rb} bits</span><span class="bitfield" style="flex:${im};background:#86efac"><b>immediate</b>${im} bits</span></div><p class="sm"><b>Encoding:</b> ${w}-bit fixed instruction. ${r} registers need ${rb} index bits each. 7 opcodes fit in 3 bits (one pattern left unused). The ${im}-bit immediate is two’s complement: ${-(2 ** (im - 1))} to ${2 ** (im - 1) - 1}; it holds MOVI constants, LOAD/STORE cell numbers (0–15) and JNZ targets, and is unused (zero) for ADD/SUB. Memory contains 16 word cells.</p><div class="sc"><table class="sm"><tr><th>Opcode</th><th>Mnemonic</th><th>Operands</th><th>Meaning</th></tr>${Object.entries(CUSTOM_OPS).map(([op, n]) => `<tr><td><code>${n.toString(2).padStart(3, '0')}</code></td><td>${op}</td><td>${{ MOVI: 'rD, constant', ADD: 'rD, rS', SUB: 'rD, rS', LOAD: 'rD, cell', STORE: 'rD, cell', JNZ: 'rD, label', HALT: '—' }[op]}</td><td>${esc(CUSTOM_MEANING[op](0, 1, 'imm').replace(/r0/g, 'rD').replace(/r1/g, 'rS').replace('imm', op === 'MOVI' ? 'constant' : op === 'JNZ' ? 'label' : 'cell'))}</td></tr>`).join('')}</table></div>`;
  isaBuilderRun();
}
function isaBuilderRun() {
  try {
    const r = +$('#icregs').value,
      w = +$('#icwidth').value,
      d = +$('#icdata').value,
      result = customRun($('#icprogram').value, r, d, w);
    const encoding = customAssemble($('#icprogram').value, r, w);
    $('#icresult').innerHTML =
      `<p class="ok">Program halted successfully. ${result.trace.length} instructions executed. Data memory cell 3 = <b>${result.mem[3]}</b>; registers ${result.r.map((v, i) => 'r' + i + '=' + v).join(', ')}.</p><h3>Assembled program</h3><div class="sc"><table class="sm"><tr><th>Address</th><th>Assembly</th><th>Machine code: opcode | dest | src | immediate</th><th>Meaning</th></tr>${encoding.map((e) => `<tr><td>${e.pc}</td><td><code>${esc(e.op + ' ' + e.args.join(','))}</code></td><td><code>${e.fields.filter((x) => x !== '').join(' | ')}</code></td><td>${esc(e.meaning)}</td></tr>`).join('')}</table></div><h3>Execution trace</h3><div class="sc"><table><tr><th>Step</th><th>PC</th><th>Assembly</th><th>Encoding (${w} bits)</th><th>Registers after</th><th>Cell 3</th><th>Next PC</th></tr>${result.trace.map((t, i) => `<tr><td>${i + 1}</td><td>${t.pc}</td><td><code>${esc(t.assembly)}</code></td><td><code>${encoding[t.pc].bits}</code></td><td><code>${esc(JSON.stringify(t.registers))}</code></td><td>${t.memory[3]}</td><td>${t.nextPC}</td></tr>`).join('')}</table></div><p class="sm mu">Encoding is a self-defined teaching format, not MIPS/RISC-V/x86 machine code. Arithmetic wraps at the chosen ${d}-bit data width (two’s complement). Execution steps are not hardware clock measurements.</p>`;
  } catch (e) {
    $('#icresult').innerHTML = `<p class="bad">${esc(String(e))}</p>`;
  }
}

VIEW.build =
  () => `<h1>Processor construction</h1><p>The table below shows which hardware each instruction need requires. The introduction video gives the big picture.</p><button class="b" onclick="iRe();$('#intro').style.display=''">Replay intro video</button>
<div class="card sc"><table><tr><th>Instruction need</th><th>Hardware that provides it</th></tr><tr><td>Subtraction</td><td>Arithmetic logic (ALU)</td></tr><tr><td>Store a result</td><td>Memory write path</td></tr><tr><td>Conditional branch</td><td>Condition check + PC update</td></tr><tr><td>Operands held close to the ALU</td><td>Registers (not needed by SUBLEQ)</td></tr></table></div>
<div class="card"><h3>ISA and microarchitecture ${BI}</h3><p>The <b>instruction set architecture</b> defines operations visible to software. The <b>microarchitecture</b> implements them. A designer can create a new ISA and its implementation together, or build a new processor for an existing ISA. An ISA is not a specific chip, so benchmark results must name the modeled implementation.</p></div>${isaBuilderView()}`;
POST.build = () => isaBuilderRender();
VIEW.oisc = () => {
  const sp = [
    [5, 3, 6],
    [2, 7, 6],
  ];
  return `<h1>OISC: a one-instruction computer</h1>
<div class="card"><h3>1 · What it is</h3><p>An OISC has one instruction form. SUBLEQ (subtract and branch if less than or equal to zero) is enough for general computation, given enough memory.</p><pre>SUBLEQ A, B, C
MEM[B] = MEM[B] − MEM[A]
if MEM[B] ≤ 0: PC = C   else: PC = next instruction</pre></div>
<div class="card"><h3>2 · Organization</h3><p class="sm">Memory ⇄ subtractor (reads A and B, writes B) → sign check (≤ 0?) → PC select (C or next). No registers and no separate opcode field.</p></div>
<div class="card"><h3>3 · Guided execution (live engine)</h3><div class="row">A <input type="number" id="dA" value="5"> B <input type="number" id="dB" value="3"> C <input type="number" id="dC" value="6"><button class="b" onclick="oiscRun()">Execute</button><button class="b s" onclick="oiscSet(5,3)">Branch taken</button><button class="b s" onclick="oiscSet(2,7)">Branch not taken</button></div><div id="od"></div></div>
<div class="card"><h3>4 · Building other operations</h3><div class="sc"><table><tr><th>Goal</th><th>SUBLEQ sequence</th><th>Run</th></tr><tr><td>Copy OUT = A</td><td><code>OUT,OUT · A,T · T,OUT</code></td><td><button class="b s" onclick="openSim('sq','COPY')">Open</button></td></tr><tr><td>Add OUT = A + B</td><td><code>A,T · B,T · T,OUT</code></td><td><button class="b s" onclick="openSim('sq','ADD')">Open</button></td></tr><tr><td>Loop + branch (taken and not taken)</td><td><code>N,T · ONE,N,exit · Z,Z,top · T,OUT</code></td><td><button class="b s" onclick="openSim('sq','SUMN')">Open</button></td></tr><tr><td>Conditional (max)</td><td>9 instructions, sign test on A−B</td><td><button class="b s" onclick="openSim('sq','MAXb')">Open</button></td></tr></table></div></div>
<div class="card"><h3>5 · Evidence</h3><p><b>One instruction type does not mean one instruction execution.</b> Addition (OUT = A + B) executes ${run('sq', W_('ADD')).dyn} SUBLEQ instructions, copy ${run('sq', W_('COPY')).dyn}, and the loop workload ${run('sq', W_('SUMN')).dyn} ${BT}.</p></div>`;
};
POST.oisc = () => oiscRun();
function oiscSet(a, b) {
  $('#dA').value = a;
  $('#dB').value = b;
  oiscRun();
}
function oiscRun() {
  let a, b, c;
  try {
    a = validNumber($('#dA').value, -10000, 10000);
    b = validNumber($('#dB').value, -10000, 10000);
    c = validNumber($('#dC').value, 0, 2000);
    if (![a, b, c].every(Number.isInteger)) throw Error('Enter whole numbers only');
  } catch (e) {
    $('#od').textContent = 'Invalid demo input: ' + e.message;
    return;
  }
  const r = demo(a, b, c);
  $('#od').innerHTML =
    `<p>Before: <b>MEM[A]=${a}, MEM[B]=${b}</b>, PC=0 · Subtract: ${b} − ${a} = <b>${r.r}</b></p><p>After: MEM[B]=${r.r} · Decision: ${r.r <= 0 ? `${r.r} ≤ 0, <b>branch taken</b>` : `${r.r} > 0, <b>not taken</b>`} · New PC = <b>${r.s.pc}</b> (${r.tk ? 'C' : 'next instruction'})</p>` +
    memV(r.s, [1]).split('</span>').slice(0, 2).join('</span>') +
    '</span>';
}
VIEW.mod = () => `<h1>Processor models</h1><div class="g">${ids
  .map((i) => {
    const M = MODELS[i];
    return `<div class="card" style="border-top:4px solid ${M.col}"><h3>${M.name}</h3><p class="sm">${BI} ${M.ver}</p><p class="sm"><b>Defined repertoire:</b> ${M.rep}<br><b>Implemented subset:</b> ${Object.keys(M.ops).length} operation(s): <code>${Object.keys(M.ops).join(', ')}</code><br><b>Organization:</b> ${M.org}<br><b>State:</b> ${M.st}<br><b>Formats:</b> ${M.fmt}<br><b>Simplifications:</b> ${M.simp}</p></div>`;
  })
  .join('')}</div>
<div class="card"><h2>What actually differs in RV32I ${BI}</h2><ul><li>No architectural branch delay slot.</li><li>No condition-code/flags register; conditional branches compare registers directly (for example, <code>blt</code> and <code>bge</code>).</li><li>Immediate values are distributed across distinct I, S, B, U and J instruction formats.</li><li>The base integer instructions are fixed at 32 bits in this lab; the compressed extension is not enabled.</li></ul><p class="sm mu">These are ISA facts. Dynamic instruction counts shown elsewhere are measured from each executed program trace, not invented estimates.</p></div><h2>Intel instruction families</h2><div class="card sc"><table><tr><th>Family</th><th>Examples (explanatory)</th><th>In this simulator</th></tr><tr><td>Data movement</td><td>MOV, LEA, PUSH, POP</td><td>MOV only</td></tr><tr><td>Arithmetic</td><td>ADD, SUB, NEG, INC/DEC, MUL, DIV</td><td>ADD, SUB, NEG, DEC, CMP</td></tr><tr><td>Logic</td><td>AND, OR, XOR, shifts</td><td>None</td></tr><tr><td>Branching</td><td>JMP, Jcc, CALL, RET</td><td>JMP, JNZ, JGE</td></tr><tr><td>Extensions</td><td>SSE, AVX vector instructions</td><td>None (explanatory only)</td></tr></table></div>`;
const CAT = [
  [
    'sq',
    'SUBLEQ A,B,C',
    'Subtract and branch',
    'A, B, C: memory addresses',
    'MEM[B]=MEM[B]−MEM[A]; if ≤0 PC=C',
    '3 × 32-bit words, 12 bytes (teaching format)',
    'Memory, ALU, sign check, PC',
    'sq',
    'A=5,B=3 → B=−2, PC=C',
    'Is the only instruction; a copy takes 3',
  ],
  [
    'mips',
    'lw rt,off(rs)',
    'Load word',
    'rt dest, rs base',
    'rt = MEM[rs+off]',
    'I-type: op 35, e.g. lw $t0,0($a0) = 0x8C880000, 4 bytes',
    'Register file, address adder, memory read',
    'ld',
    'MEM[0]=9 → $t0=9',
    'RV32I: lw t0,0(a0) = 0x00052283',
  ],
  [
    'mips',
    'addu rd,rs,rt',
    'Add (no overflow trap)',
    'rd, rs, rt registers',
    'rd = rs + rt',
    'R-type, e.g. addu $t2,$t0,$t1 = 0x01095021, 4 bytes',
    'Register file, ALU',
    'alu',
    '$t0=7,$t1=5 → $t2=12',
    'RV32I: add t2,t0,t1',
  ],
  [
    'mips',
    'sw rt,off(rs)',
    'Store word',
    'rt source, rs base',
    'MEM[rs+off] = rt',
    'I-type: op 43, e.g. sw $t2,8($a0) = 0xAC8A0008, 4 bytes',
    'Register file, address adder, memory write',
    'st',
    '$t2=12 → MEM[8]=12',
    'x86: mov [rdi+8],eax',
  ],
  [
    'mips',
    'bne rs,rt,label',
    'Branch if not equal',
    'rs, rt, target',
    'if rs≠rt PC=target',
    'I-type, 4 bytes (delay slot abstracted)',
    'Register file, comparator, PC update',
    'br',
    't0=4 → loop again',
    'SUBLEQ: ONE,N,exit + Z,Z,top',
  ],
  [
    'rv',
    'lw rd,imm(rs1)',
    'Load word',
    'rd, rs1, imm12',
    'rd = MEM[rs1+imm]',
    'I-type, funct3=010, opcode 0000011; lw t0,0(a0) = 0x00052283',
    'Register file, adder, memory read',
    'ld',
    'MEM[0]=9 → t0=9',
    'MIPS32: lw $t0,0($a0)',
  ],
  [
    'rv',
    'add rd,rs1,rs2',
    'Add',
    'rd, rs1, rs2',
    'rd = rs1 + rs2',
    'R-type, opcode 0110011; add t2,t0,t1 = 0x006283B3',
    'Register file, ALU',
    'alu',
    't0=7,t1=5 → t2=12',
    'x86: add eax,[rdi+4] (memory operand)',
  ],
  [
    'rv',
    'sw rs2,imm(rs1)',
    'Store word',
    'rs2, rs1, imm12',
    'MEM[rs1+imm] = rs2',
    'S-type, opcode 0100011; sw t2,8(a0) = 0x00752423',
    'Register file, adder, memory write',
    'st',
    't2=12 → MEM[8]=12',
    'SUBLEQ: T,OUT after clearing OUT',
  ],
  [
    'x86',
    'mov eax,[rdi+d]',
    'Load 32-bit',
    'EAX dest, memory source',
    'EAX = MEM[RDI+d]',
    '8B /r: mov eax,[rdi] = 8B 07 (2 bytes); with disp8, 3 bytes',
    'Register, address adder, memory read',
    'ld',
    'MEM[0]=7 → EAX=7',
    'RISC-V: lw t0,0(a0)',
  ],
  [
    'x86',
    'add eax,[rdi+d]',
    'Add with memory operand',
    'EAX, memory source',
    'EAX = EAX + MEM[RDI+d]',
    '03 /r: add eax,[rdi+4] = 03 47 04 (3 bytes)',
    'Address adder, memory read, ALU',
    'alum',
    'EAX=7,MEM[4]=5 → 12',
    'RISC-V: lw + add (2 instructions)',
  ],
  [
    'x86',
    'jnz label',
    'Jump if not zero',
    'rel8 target',
    'if ZF=0 PC=target',
    '75 cb (2 bytes)',
    'Flags, PC update',
    'br',
    'ECX=0 → falls through',
    'MIPS32: bne',
  ],
];
const STEPS = {
  ld: 'fetch → decode → address calc → memory read → write-back',
  st: 'fetch → decode → address calc → memory write',
  alu: 'fetch → decode → ALU → write-back',
  alum: 'fetch → decode → memory read → ALU → write-back',
  br: 'fetch → decode → compare → PC update',
  sq: 'fetch → decode → read A → read B → subtract → write B → sign check → PC update',
};
let eM = 'sq',
  eI = 0;
VIEW.exp = () =>
  `<h1>Instruction explorer</h1><div class="row">${sel('eM', mO, eM, 'eSet')}</div><div id="eb"></div><h2>Four meanings of “number of instructions”</h2><div class="row">${sel('cm', mO, eM, 'eSet2')}${sel('cw', wO, 'SUMN', 'eSet3')}</div><div id="ec"></div>`;
POST.exp = () => {
  eRender();
  eCount();
};
const eSet = (v) => {
    eM = v;
    eI = 0;
    eRender();
    $('#cm').value = v;
    eCount();
  },
  eSet2 = (v) => {
    eM = v;
    $('#eM').value = v;
    eI = 0;
    eRender();
    eCount();
  },
  eSet3 = () => eCount();
function eRender() {
  const l = CAT.filter((c) => c[0] == eM),
    c = l[eI] || l[0],
    M = MODELS[eM];
  $('#eb').innerHTML =
    `<div class="row">${l.map((x, i) => `<button class="b ${i == eI ? '' : 's'}" onclick="eI=${i};eRender()">${x[1]}</button>`).join('')}</div><div class="card"><h3>${c[1]} – ${c[2]}</h3><p class="sm">${BI} Operands: ${c[3]}<br>Semantics: <code>${c[4]}</code><br>Encoding and length: ${c[5]}<br>Hardware: ${c[6]}<br>Modeled steps: ${STEPS[c[7]]}<br>Cycle cost: ${BA} ${M.cyc[c[7]]} cycle(s) (editable on Compare)<br>Worked example: ${c[8]}<br>Equivalent in another model: ${c[9]}</p></div>`;
}
function eCount() {
  const id = $('#cm').value,
    w = W_($('#cw').value),
    M = MODELS[id],
    r = run(id, w);
  $('#ec').innerHTML =
    `<div class="g"><div class="card"><b>ISA repertoire</b>${BI}<br>${M.rep}</div><div class="card"><b>Implemented subset</b><br>${Object.keys(M.ops).length} operation(s) in this simulator</div><div class="card"><b>Static instructions</b>${BT}<br>${r.st} in the ${w.n} program</div><div class="card"><b>Dynamic instructions</b>${BT}<br>${r.dyn} executed in this run</div></div><p class="sm mu">No single instruction count is shown for a whole architecture family.</p>${encodingView(id, w)}`;
}
const MIPS_NAME_BY_NUM = Object.fromEntries(Object.entries(MIPS_REG).map(([k, v]) => [v, k]));
/* Human-readable decode of the fields of one MIPS32/RV32I machine word. */
function decodeFields(id, ins, pc, fields) {
  const op = ins.t.replace(/^[A-Za-z_]\w*:\s*/, '').split(/\s+/)[0].toLowerCase(),
    x = ins.x;
  const regName = (n) => (id === 'mips' ? '$' + MIPS_NAME_BY_NUM[n] + ' ($' + n + ')' : PX_RV_NAME[n] + ' (x' + n + ')');
  const parts = [];
  for (const fl of fields) {
    const n = parseInt(fl.value, 2);
    if (/^(rs|rt|rd|rs1|rs2)$/.test(fl.label)) parts.push(`${fl.label} = ${n} → ${regName(n)}`);
    else if (fl.label === 'opcode') parts.push(`opcode = 0x${n.toString(16).toUpperCase()} (${op})`);
    else if (/funct/.test(fl.label)) parts.push(`${fl.label} = 0x${n.toString(16).toUpperCase()}`);
    else if (fl.label === 'shamt') parts.push('shamt = ' + n);
  }
  let imm = null;
  if (op === 'lw' || op === 'sw') imm = `offset = ${ea(x[1])[1]} bytes (${id === 'rv' ? (op === 'sw' ? 'S-type: split as imm[11:5] | imm[4:0]' : 'I-type 12-bit') : '16-bit, sign-extended'})`;
  else if (op === 'addi' || op === 'addiu') imm = `immediate = ${Number(x[2])} (${id === 'rv' ? '12-bit' : '16-bit'} two’s complement, sign-extended)`;
  else if (op === 'lui' || op === 'auipc') imm = `imm20 = ${Number(x[1])} → contributes ${Number(x[1])} × 4096 = ${(Number(x[1]) << 12) | 0}`;
  else if (['beq', 'bne', 'blt', 'bge'].includes(op))
    imm = id === 'mips' ? `offset = ${x.tg - (pc + 1)} words from PC+4 → target instruction ${x.tg} (byte ${x.tg * 4})` : `offset = ${(x.tg - pc) * 4} bytes from this PC (B-type: imm[12|10:5] and imm[4:1|11]; bit 0 is always 0) → target instruction ${x.tg}`;
  if (imm) parts.push(imm);
  return parts.join(' · ');
}
function encodingView(id, w) {
  const p = asm(MODELS[id], PROG[w.p][id]);
  return `<div class="card sc"><h3>Actual program instruction encoding</h3><p class="sm mu">MIPS32 and RV32I values are 32-bit architecture encodings. SUBLEQ shows the three 32-bit words chosen by this teaching model; x86 byte counts are still estimates. Branch offsets are calculated from instruction-indexed teaching PC positions.</p><table><tr><th>PC</th><th>Assembly</th><th>Machine word</th><th>Field-level bit diagram</th><th>Size</th></tr>${p
    .map((ins, i) => {
      const e = encodeInstruction(id, ins, i),
        fields = encodingFields(id, ins, i);
      return `<tr><td>${i}</td><td><code>${esc(ins.t)}</code></td><td><code>${e.hex || 'Not implemented'}</code></td><td>${fields ? `<div class="bitbar" role="img" aria-label="${fields.map((f) => f.label + ' ' + f.value).join(', ')}">${fields.map((f) => `<span class="bitfield" style="flex:${f.bits};background:${f.color}" title="${f.label}: ${f.value} (${f.bits} bits)"><b>${f.label}</b>${f.value}</span>`).join('')}</div><div class="sm mu">${fields.map((f) => f.label + ' ' + f.bits + 'b').join(' · ')}</div><div class="sm decode">${esc(decodeFields(id, ins, i, fields))}</div>` : '<span class="sm mu">Field breakdown not available for this teaching format.</span>'}</td><td>${e.bytes} B</td></tr>`;
    })
    .join(
      ''
    )}</table>${id === 'rv' ? `<div class="card"><h3>RV32I idioms ${BI}</h3><p><code>blt rs1, rs2, label</code> and <code>bge rs1, rs2, label</code> compare registers directly; no separate condition-code register or <code>slt</code> result is required.</p><p><code>lui rd, imm20</code> loads an upper immediate; <code>auipc rd, imm20</code> adds an upper immediate to the current PC. The U-type immediate format is distinct from I/S/B formats.</p><p class="sm mu">This simulator executes its listed RV32I subset only; examples and counts are trace-derived, not inferred from ISA repertoire size.</p></div>` : ''}</div>`;
}
/* simulator */
let SIM = null,
  sT = null,
  sM = 'sq',
  sW = 'ADD',
  sSp = 700,
  TIMING = 'multi',
  PIPE_ARCH = 'rv',
  PIPE_FORWARD = true,
  PIPE_BRANCH = 2,
  PIPE_POLICY = 'every';
VIEW.sim = () =>
  `<h1>Execution simulator</h1><div class="row">${sel('sm', mO, sM, 'simSel')}${sel('sw', wO, sW, 'simSelW')}<label>Timing model <select id="timing-mode" onchange="setTimingMode(this.value)"><option value="multi" ${TIMING === 'multi' ? 'selected' : ''}>Multicycle + datapath (default)</option><option value="pipeline" ${TIMING === 'pipeline' ? 'selected' : ''}>Five-stage pipeline (explained)</option></select></label></div><div id="sim-ctl"></div><div id="sd"></div>`;
POST.sim = () => simReset();
function setTimingMode(v) {
  TIMING = v;
  simDraw();
}
function tracedRun(arch, workload) {
  const s = mk(arch, W_(workload));
  while (!s.halt) step(s);
  return s;
}
function simCtl() {
  const el = $('#sim-ctl');
  if (!el) return;
  el.innerHTML =
    TIMING === 'pipeline'
      ? ''
      : `<div class="row"><button class="b" onclick="simPlay()">${sT ? '▶ Running…' : '▶ Play'}</button><button class="b s" onclick="simStop();simDraw()">❚❚ Pause</button><button class="b s" onclick="simStep()">Step instruction</button><button class="b s" onclick="simBack()">Step back</button><button class="b s" onclick="simReset()">Reset</button><label class="sm">Breakpoint PC <input id="bp" type="number" min="0" max="1999" placeholder="none" style="width:75px" aria-label="Breakpoint program counter" value="${SIM_BP}" onchange="SIM_BP=this.value"></label><label class="sm">Speed <input type="range" min="1" max="10" value="${(1100 - sSp) / 100}" oninput="sSp=1100-this.value*100" aria-label="Animation speed"></label></div><p id="sim-msg" class="bad sm" role="alert"></p>`;
}
/* Pipeline mode: the interactive explanation component on the selected workload. */
function pipelineView() {
  const arch = sM === 'mips' || sM === 'rv' ? sM : PIPE_ARCH;
  const key = 'sim-px';
  const prev = PX[key];
  if (!prev || prev.workload !== sW || (prev.source === 'workload' && prev.arch !== arch))
    pxCreate(key, { arch, source: prev?.source || 'workload', workload: sW, lockWorkload: true, forwarding: prev?.forwarding ?? PIPE_FORWARD, penalty: prev?.penalty ?? PIPE_BRANCH, policy: prev?.policy ?? PIPE_POLICY, mhz: S.mhz, onChange: (st) => {
        PIPE_ARCH = st.arch;
        PIPE_FORWARD = st.forwarding;
        PIPE_BRANCH = st.penalty;
        PIPE_POLICY = st.policy;
        if ((sM === 'rv' || sM === 'mips') && st.arch !== sM) {
          sM = st.arch;
          if ($('#sm')) $('#sm').value = sM;
          SIM = mk(sM, W_(sW));
          SIM.recordHistory = true;
        }
      } });
  return `<div class="card"><h3>Five-stage pipeline: IF → ID → EX → MEM → WB ${BT}${BC}</h3>${sM === 'sq' || sM === 'x86' ? `<p class="sm" role="note"><b>Note:</b> the pipeline model covers RV32I and MIPS32 only (SUBLEQ and the x86 subset are not modelled as five-stage pipelines), so it shows the ${MODELS[arch].name} version of this workload.</p>` : ''}<p class="sm mu">The dynamic instruction sequence is the interpreter's actual trace. In-order, single-issue, one cycle per stage, register file written in the first half of a cycle and read in the second. Forwarding paths EX/MEM → EX and MEM/WB → EX; a load followed by a use still needs one bubble. Branches resolve in EX; the penalty is an editable assumption applied to every branch (stall until resolved) or only to taken branches (predict not-taken, flush). No structural hazards, prediction or cache stalls are modelled.</p><div id="${key}"></div></div>`;
}
function cacheView() {
  const arch = TIMING === 'pipeline' ? PX['sim-px']?.arch || PIPE_ARCH : sM;
  let c;
  try {
    c = simulateCache(tracedRun(arch, sW).accesses, S.cache);
  } catch (e) {
    return `<div class="card"><p class="bad">${esc(e.message)}</p></div>`;
  }
  return `<div class="card"><h3>Data cache for this run — ${MODELS[arch].name} ${BT}${BC}</h3><p class="sm mu">Replays this workload's traced data addresses through the cache configured on the Compare page (${S.cache.cacheSize} B, ${S.cache.blockSize} B blocks, ${S.cache.associativity === 1 ? 'direct-mapped' : S.cache.associativity + '-way'}, ${S.cache.policy}). Instruction fetches are excluded.</p>${cvStats(c, MODELS[arch].name)}<div class="row"><button class="b s" onclick="CL.src='trace';CL.model='${arch}';CL.workload='${sW}';CL.preset='';go('cache')">Visualise this run in the Cache Lab</button></div></div>`;
}
function setCacheValue(k, v, el) {
  const n = Number(v);
  if (String(v).trim() === '' || !Number.isFinite(n) || n < 0) {
    if (el) {
      el.setCustomValidity('Enter a non-negative number');
      el.reportValidity();
      el.value = S.cache[k];
    }
    return false;
  }
  if (el) el.setCustomValidity('');
  S.cache[k] = n;
  return true;
}
function setCacheSize(v) {
  S.cache.cacheSize = Number(v);
  if (S.cache.blockSize > S.cache.cacheSize) S.cache.blockSize = S.cache.cacheSize;
  const lines = S.cache.cacheSize / S.cache.blockSize;
  if (S.cache.associativity > lines) S.cache.associativity = lines;
  /* re-render the page so the associativity choices match the new geometry, keeping the scroll position */
  const y = window.scrollY;
  go('cmp');
  window.scrollTo(0, y);
}
const simSel = (v) => {
    sM = v;
    simReset();
  },
  simSelW = (v) => {
    sW = v;
    simReset();
  };
function openSim(m, w) {
  sM = m;
  sW = w;
  go('sim');
}
function simReset() {
  simStop();
  dpStop();
  SIM = mk(sM, W_(sW));
  SIM.recordHistory = true;
  DP.phase = DP.byPhase ? 0 : 5;
  simDraw();
}
function simStep(auto) {
  if (!SIM.halt) step(SIM);
  if (!auto) dpStop();
  DP.phase = DP.byPhase && !auto ? 0 : 5;
  simDraw();
}
function simBack() {
  simStop();
  dpStop();
  stepBack(SIM);
  DP.phase = DP.byPhase ? 0 : 5;
  simDraw();
}
let SIM_BP = '';
function simPlay() {
  if (sT) return;
  const bp = String($('#bp')?.value ?? SIM_BP).trim();
  SIM_BP = bp;
  const msg = $('#sim-msg');
  if (msg) msg.textContent = '';
  if (bp !== '' && (!/^\d+$/.test(bp) || +bp >= SIM.p.length)) {
    if (msg) msg.textContent = 'Breakpoint must be an instruction index from 0 to ' + (SIM.p.length - 1) + '.';
    return;
  }
  if (SIM.halt) {
    if (msg) msg.textContent = 'The program has finished. Press Reset to run it again.';
    return;
  }
  dpStop();
  /* the first step always executes, so Play resumes from a breakpoint instead of stopping on it again */
  let first = true;
  sT = setInterval(() => {
    if (!first && bp !== '' && SIM.pc === +bp) {
      simStop();
      if (msg) msg.textContent = 'Stopped at breakpoint PC ' + bp + '. Press Play to continue.';
      simDraw();
      return;
    }
    first = false;
    simStep(true);
    if (SIM.halt) {
      simStop();
      simDraw();
    }
  }, sSp);
  simCtl();
}
function simStop() {
  clearInterval(sT);
  sT = null;
}
function simDraw() {
  if (!$('#sd')) return;
  simCtl();
  if (TIMING === 'pipeline') {
    $('#sd').innerHTML = pipelineView() + cacheView();
    pxDraw('sim-px');
    return;
  }
  const s = SIM,
    w = W_(sW),
    M = MODELS[sM],
    L = s.last,
    ch = s.tr.length ? s.tr[s.tr.length - 1].ch : [];
  const regs = Object.keys(s.r).length ? Object.entries(s.r).map(([k, v]) => `<span class="chip">${esc(sM === 'rv' ? regLabel('rv', k) : sM === 'mips' ? '$' + k : k.toUpperCase())} = ${v}</span>`).join('') : '<span class="sm mu">all registers are 0</span>';
  $('#sd').innerHTML =
    `${datapathPanel(s)}<div class="g"><div class="card"><h3>Program (PC = ${s.pc})</h3>${s.p.map((i, n) => `<code class="${n == s.pc && !s.halt ? 'cur' : ''}" style="display:block">${n}: ${esc(i.t)}</code>`).join('')}</div><div class="card"><h3>State</h3><p class="sm">Last: ${L ? `<code>${esc(L.t)}</code> → ${esc(L.n)}` : 'none yet'}<br>Dynamic instructions: <b>${s.c.dyn}</b> · multicycle cycles: <b>${s.c.cyc}</b> ${BC} (per-class costs: ${Object.entries(M.cyc).map(([k, v]) => k + ' ' + v).join(', ')} ${BA})</p>${sM === 'sq' ? '<p class="sm mu">SUBLEQ has no registers.</p>' : `<div class="sm">Registers: ${regs}</div>${sM === 'x86' ? `<p class="sm">Flags: ${['z', 's', 'o', 'c'].map((k) => k.toUpperCase() + 'F=' + +!!s.f[k]).join(' ')}</p>` : ''}`}${s.halt ? `<p>${s.err ? `<span class="bad">${esc(s.err)}</span>` : `Halted. OUT = <b>${s.m[3]}</b>, expected ${w.ex} ${s.m[3] == w.ex ? '<span class="ok">✓ verified</span>' : '<span class="bad">✗ mismatch</span>'}`}</p>` : ''}</div></div><div class="card"><h3>Data memory (32-bit words, changed cells highlighted)</h3>${memV(s, ch)}</div><div class="card sc"><h3>Execution trace ${BT}</h3><table><tr><th>#</th><th>PC</th><th>Instruction</th><th>Effect</th><th>Cycles</th></tr>${s.tr
      .slice(-30)
      .map((t) => `<tr><td>${t.n}</td><td>${t.pc}</td><td><code>${esc(t.t)}</code></td><td>${esc(t.note)}</td><td>${t.cy}</td></tr>`)
      .join('')}</table></div><p class="sm mu">Speed changes only the animation timer. Benchmarks run the same engine to completion with no timing involved. Rules: 32-bit two’s-complement wraparound, word-aligned addresses, memory initialised from the workload (extra cells = 0, ONE = 1), registers = 0, halt when the PC leaves the program, limit ${LIM} instructions. The multicycle model charges a fixed number of cycles per instruction class; the phase list in the datapath shows what each class does, and the cycle costs are editable on the Compare page (a textbook preset is available there).</p>${cacheView()}`;
}
/* benchmarks */
let bW = 'ADD';
VIEW.bench = () =>
  `<h1>Benchmarks</h1><div class="row">${sel('bw', wO, bW, 'bSet')}</div><div class='card'><b>Predict first.</b> For this workload, which model needs the fewest <select id='pm2'><option value='cyc'>cycles</option><option value='dyn'>dynamic instructions</option><option value='size'>code bytes</option></select>?<div class='row'>${ids.map((i) => `<button class='b s' onclick="pred('${i}')">${MODELS[i].name}</button>`).join('')}</div><div id='pd'></div></div><div id="bb"></div><div class="card sm"><b>Metrics:</b> <i>static</i> = instructions written; <i>dynamic</i> = instructions executed (loops repeat them); <i>multicycle cycles</i> = Σ executed instructions × cycles for their class (editable on Compare); <i>CPI</i> = cycles ÷ dynamic instructions; <i>time</i> = cycles ÷ clock; <i>pipeline cycles</i> = five-stage schedule of the same trace (RV32I and MIPS32 only). Counts are simulated; cycles, CPI and time are calculated from stated assumptions; nothing is measured on hardware.<br><b>Counting rules:</b> input memory, constants (ONE, zero cells), base-pointer and zeroed registers are prepared before measuring; startup, call/return and OS services are excluded; the program runs until it ends. Programs are hand-written, minimal and not compiler-optimised; loop and conditional programs are illustrative and not fully optimised for every model. MIPS32 and RV32I use the same structure with different mnemonics and encodings.</div>`;
POST.bench = () => bSet(bW);
function benchmarkInputs(w) {
  const editable = ['ARR', 'ARR_LOOP', 'MAXARR'].includes(w.id)
    ? [10, 11, 12, 13]
    : w.id === 'SUMN' || w.id === 'FIB'
      ? [0]
      : w.id === 'EXPR'
        ? [0, 1, 2]
        : w.id === 'COPY' || w.id === 'NEG'
          ? [0]
          : [0, 1];
  return `<div class="card"><h3>Experiment: change the inputs ${BA}</h3><p class="sm mu">The same updated input values run on all four models. SUBLEQ’s looped array workload uses an explicitly labeled indirect-address extension; the baseline SUBLEQ array sum remains unrolled because base SUBLEQ has no indirect addressing.</p><div class="row">${editable.map((i) => `<label>Cell ${i} <input type="number" id="bi${i}" value="${w.mem[i] || 0}" min="-10000" max="10000" step="1" style="width:92px"></label>`).join('')}<button class="b" onclick="benchmarkApply()">Run new inputs</button><button class="b s" onclick="benchmarkRestore()">Restore original</button></div><div id="bierror" class="bad sm"></div></div>`;
}
const DEFAULT_WORKLOADS = WL.map((w) => ({ id: w.id, mem: { ...w.mem }, ex: w.ex, task: w.task }));
function benchmarkApply() {
  const w = W_(bW),
    mem = { ...w.mem };
  try {
    for (const el of document.querySelectorAll('[id^="bi"]')) {
      if (!/^bi\d+$/.test(el.id)) continue;
      const i = +el.id.slice(2),
        v = validNumber(el.value, -10000, 10000);
      if (!Number.isInteger(v)) throw Error('Inputs must be integers');
      mem[i] = v;
    }
    if (
      ['SUMN', 'FIB'].includes(w.id) &&
      (mem[0] < (w.id === 'FIB' ? 0 : 1) || mem[0] > (w.id === 'FIB' ? 15 : 30))
    )
      throw Error(w.id === 'FIB' ? 'Fibonacci n must be between 0 and 15' : 'N must be between 1 and 30');
    if (w.id === 'FIB') mem[11] = mem[0];
    if (['ARR', 'ARR_LOOP', 'MAXARR'].includes(w.id)) {
      mem[9] = -1;
      mem[14] = 10;
      mem[15] = 4;
    }
    const a = mem[0] || 0,
      b = mem[1] || 0,
      c = mem[2] || 0;
    let ex;
    switch (w.p) {
      case 'ADD':
        ex = (a + b) | 0;
        break;
      case 'COPY':
        ex = a;
        break;
      case 'NEG':
        ex = -a | 0;
        break;
      case 'EXPR':
        ex = (a + b - c) | 0;
        break;
      case 'SUMN':
        ex = (mem[0] * (mem[0] + 1)) / 2;
        break;
      case 'FIB': {
        let x = 0,
          y = 1;
        for (let j = 0; j < mem[0]; j++) {
          const z = x + y;
          x = y;
          y = z;
        }
        ex = x;
        break;
      }
      case 'MAX':
        ex = Math.max(a, b);
        break;
      case 'ARR':
      case 'ARR_LOOP':
        ex = (mem[10] + mem[11] + mem[12] + mem[13]) | 0;
        break;
      case 'MAXARR':
        ex = Math.max(mem[10], mem[11], mem[12], mem[13]);
        break;
    }
    w.mem = mem;
    w.ex = ex;
    w.task = 'Custom inputs: expected OUT = ' + ex;
    bSet(w.id);
    if ($('#co')) cOut();
  } catch (e) {
    $('#bierror').textContent = String(e);
  }
}
function benchmarkRestore() {
  const w = W_(bW),
    o = DEFAULT_WORKLOADS.find((x) => x.id === w.id);
  w.mem = { ...o.mem };
  w.ex = o.ex;
  w.task = o.task;
  bSet(w.id);
  if ($('#co')) cOut();
}

function bSet(v) {
  bW = v;
  const w = W_(v);
  $('#bb').innerHTML =
    `${benchmarkInputs(w)}<p><b>${w.task}</b> · inputs ${JSON.stringify(w.mem)} · expected OUT = ${w.ex}${w.opt ? ' · illustrative, not optimised' : ''}${w.id === 'ARR' ? ' · SUBLEQ is unrolled' : w.id === 'ARR_LOOP' ? ' · SUBLEQ indirect-address extension, not base SUBLEQ' : ''}</p><div class="g">${ids
      .map((i) => {
        const r = met(i, w);
        return `<div class="card" style="border-top:4px solid ${MODELS[i].col}"><h3>${MODELS[i].name}</h3><pre>${esc(PROG[w.p][i].join('\n'))}</pre><table class="kv sm"><tr><td>Static / dynamic instructions ${BT}</td><td>${r.st} / ${r.dyn}</td></tr><tr><td>Multicycle cycles · CPI ${BC}</td><td>${r.cyc} · ${f(r.cpi, 3)}</td></tr><tr><td>Execution time at ${S.mhz} MHz ${BC}</td><td>${f(r.t, 1)} ns</td></tr><tr><td>Five-stage pipeline cycles · CPI ${BC}</td><td>${r.pipeCycles == null ? '<span class="mu">not modelled</span>' : r.pipeCycles + ' · ' + f(r.pipeCPI, 3)}</td></tr><tr><td>Code size</td><td>${r.size} B ${i === 'x86' ? BE : BT}</td></tr></table><p class="sm">Output ${r.got} vs expected ${w.ex} ${r.ok ? '<span class="ok">✓ verified</span>' : '<span class="bad">✗ rejected</span>'}</p><button class="b s" onclick="openSim('${i}','${w.id}')">Step through</button></div>`;
      })
      .join('')}</div>`;
}
/* compare */
const KP = [
  ['Static instructions', 'count', BT, (m) => m.st],
  ['Dynamic instructions', 'count', BT, (m) => m.dyn],
  ['Total cycles (multicycle)', 'cycles', BC, (m) => m.cyc],
  ['CPI (multicycle)', 'cycles/instr', BC, (m) => m.cpi],
  ['Five-stage pipeline cycles', 'cycles', BC, (m) => m.pipeCycles],
  ['Pipeline CPI', 'cycles/instr', BC, (m) => m.pipeCPI],
  ['Execution time (multicycle)', 'ns', BC, (m) => m.t],
  ['Data reads', 'words', BT, (m) => m.rd],
  ['Data writes', 'words', BT, (m) => m.wr],
  ['Code size', 'bytes', BT, (m) => m.size],
  ['Data footprint', 'bytes', BT, (m) => m.fb],
  ['Cache hits', 'count', BT, (m) => m.cacheHits],
  ['Cache misses', 'count', BT, (m) => m.cacheMisses],
  ['Cache miss rate', '%', BC, (m) => m.cacheMissRate * 100],
  ['AMAT', 'cycles/access', BC, (m) => m.amat],
  ['Assumed power', 'W', BA, (m) => m.pw],
  ['Energy (assumed power × time)', 'nJ', BE, (m) => m.e],
  ['Development effort', 'hours', BA, (m) => m.hrs],
  ['Labour cost (hours × rate)', 'USD', BE, (m) => m.lab],
  ['Area, transistors, price, measured power', '–', BN, () => null],
];
/* cycle-cost presets: lab defaults (as shipped) and the Patterson & Hennessy multicycle MIPS figures */
const CYC_DEFAULT = Object.fromEntries(Object.keys(MODELS).map((i) => [i, { ...MODELS[i].cyc }]));
const CYC_TEXTBOOK = { ld: 5, st: 4, alu: 4, br: 3 };
function applyCyclePreset(name) {
  for (const i of Object.keys(MODELS)) Object.assign(MODELS[i].cyc, CYC_DEFAULT[i]);
  if (name === 'textbook') for (const i of ['mips', 'rv']) Object.assign(MODELS[i].cyc, CYC_TEXTBOOK);
  const y = window.scrollY;
  go('cmp');
  window.scrollTo(0, y);
}
/* five-stage pipeline cycles for the comparison table (RV32I and MIPS32 only) */
const PIPE_MEMO = {};
function pipeFor(id, w) {
  if (!PIPELINE_SUPPORTED_ARCHS.includes(id)) return null;
  const key = JSON.stringify([id, w.id, w.mem, PIPE_FORWARD, PIPE_BRANCH, PIPE_POLICY]);
  if (!PIPE_MEMO[key]) {
    if (Object.keys(PIPE_MEMO).length > 300) for (const k of Object.keys(PIPE_MEMO)) delete PIPE_MEMO[k];
    const s = mk(id, w);
    while (!s.halt) step(s);
    PIPE_MEMO[key] = simulatePipeline(traceToPipelineInput(s.tr), { arch: id, forwarding: PIPE_FORWARD, branchPenalty: PIPE_BRANCH, branchPolicy: PIPE_POLICY });
  }
  return PIPE_MEMO[key];
}
const MK = {
  cyc: ['Total cycles', 'cyc'],
  dyn: ['Dynamic instructions', 'dyn'],
  size: ['Code size (bytes)', 'size'],
  mem: ['Data accesses (words)', 'mem'],
  misses: ['Cache misses', 'cacheMisses'],
  amat: ['Average memory access time', 'amat'],
  t: ['Execution time (ns)', 't'],
  e: ['Energy (nJ)', 'e'],
};
VIEW.cmp =
  () => `<h1>Compare &amp; reports</h1><div class="card beg"><h3>Assumptions ${BA}</h3><p class="sm">Results use default teaching assumptions (100 MHz clock, fixed power and cycle costs). Switch to Intermediate in the header to edit them.</p></div><div class="card adv"><h3>Assumptions ${BA}</h3><div class="row">Clock <input type="number" id="mhz" value="${S.mhz}" oninput="setAssumption(this,'mhz',0.001)"> MHz · Hourly rate $<input type="number" id="rate" value="${S.rate}" oninput="setAssumption(this,'rate',0)"></div><div class="sc"><table><tr><th>Model</th><th>Power (W)</th><th>Hours</th><th>Cycles per class</th></tr>${ids
    .map((i) => {
      const M = MODELS[i];
      return `<tr><td>${M.name}</td><td><input type="number" step=".05" value="${M.pw}" onchange="setModelAssumption(this,'${i}','pw',0)"></td><td><input type="number" value="${M.hrs}" onchange="setModelAssumption(this,'${i}','hrs',0)"></td><td>${Object.keys(
        M.cyc
      )
        .map(
          (k) => `${k} <input type="number" value="${M.cyc[k]}" onchange="setModelCycle(this,'${i}','${k}')">`
        )
        .join(' ')}</td></tr>`;
    })
    .join(
      ''
    )}</table></div><div class="row"><span class="sm"><b>Cycle-cost preset:</b></span><button class="b s" onclick="applyCyclePreset('default')">Lab defaults</button><button class="b s" onclick="applyCyclePreset('textbook')">Textbook multicycle for MIPS32 &amp; RV32I (load 5, store 4, ALU 4, branch 3)</button></div><p class="sm mu">The lab defaults charge 1–2 cycles per RISC instruction class; the textbook preset uses the Patterson &amp; Hennessy multicycle MIPS figures (one cycle per phase: fetch, decode, execute, memory, write-back). SUBLEQ and x86 keep their own assumptions. Defaults come from the supplied research as teaching assumptions, not measurements. Instruction fetches are not modeled. Execution time is separate from development time, power from energy, and educational labor cost from chip manufacturing cost.</p></div>
<div class="card"><div class="row"><b>Models</b>${ids.map((i) => `<label><input type="checkbox" ${S.sel.includes(i) ? 'checked' : ''} onchange="tg('sel','${i}',this.checked)"> ${MODELS[i].name}</label>`).join(' ')}</div><div class="row"><b>Workloads</b>${WL.map((w) => `<label><input type="checkbox" ${S.wls.includes(w.id) ? 'checked' : ''} onchange="tg('wls','${w.id}',this.checked)"> ${w.n}</label>`).join(' ')}</div><div class="row">Focus workload ${sel('fw', wO, S.foc, 'fcs')} Chart metric ${sel(
    'mt',
    Object.keys(MK).map((k) => [k, MK[k][0]]),
    S.met,
    'mts'
  )} Baseline ${sel('bl', mO, S.base, 'bls')}</div></div><div class="card adv"><h3>Data-cache assumptions ${BA}</h3><div class="row"><label>Cache size <select onchange="setCacheSize(this.value)">${[32, 64, 128, 256, 512, 1024].map((v) => `<option value="${v}" ${S.cache.cacheSize === v ? 'selected' : ''}>${v} B</option>`).join('')}</select></label><label>Block size <select onchange="S.cache.blockSize=Number(this.value);setCacheSize(S.cache.cacheSize)">${[4, 8, 16, 32, 64]
    .filter((v) => v <= S.cache.cacheSize)
    .map((v) => `<option value="${v}" ${S.cache.blockSize === v ? 'selected' : ''}>${v} B</option>`)
    .join('')}</select></label><label>Associativity <select onchange="S.cache.associativity=Number(this.value);cOut()">${(() => {
    const o = [];
    for (let w = 1; w <= S.cache.cacheSize / S.cache.blockSize; w *= 2) o.push(`<option value="${w}" ${S.cache.associativity === w ? 'selected' : ''}>${w === 1 ? 'direct-mapped' : w === S.cache.cacheSize / S.cache.blockSize ? 'fully associative (' + w + ')' : w + '-way'}</option>`);
    return o.join('');
  })()}</select></label><label>Replacement <select onchange="S.cache.policy=this.value;cOut()">${CACHE_POLICIES.map((v) => `<option ${S.cache.policy === v ? 'selected' : ''}>${v}</option>`).join('')}</select></label><label>Writes <select onchange="S.cache.writePolicy=this.value;cOut()">${WRITE_POLICIES.map((v) => `<option ${S.cache.writePolicy === v ? 'selected' : ''}>${v}</option>`).join('')}</select></label><label>Hit time <input type="number" min="0" step="0.1" value="${S.cache.hitTime}" onchange="setCacheValue('hitTime',this.value,this)&&cOut()" style="width:70px"></label><label>Miss penalty <input type="number" min="0" value="${S.cache.missPenalty}" onchange="setCacheValue('missPenalty',this.value,this)&&cOut()" style="width:70px"></label></div><p class="sm mu">Data accesses only (instruction fetches excluded); write-allocate. AMAT = hit time + miss rate × miss penalty. Explore these settings step by step in the <button type="button" class="linkish" onclick="go('cache')">Cache Lab</button>. These are editable model assumptions, not hardware measurements.</p></div><div id="co"></div><div class='card adv'><h3>What if? Sweep one assumption ${BA}</h3><div class='row'>Model ${sel('wm', mO, 'sq', 'wiM')} cost class <select id='wk' onchange='wiDraw()'></select> from 1 to 8 cycles (focus workload)</div><div id='wi'></div></div>`;
POST.cmp = () => cOut();
function tg(k, v, on) {
  S[k] = S[k].filter((x) => x != v);
  if (on) S[k].push(v);
  cOut();
}
const fcs = (v) => {
    S.foc = v;
    cOut();
  },
  mts = (v) => {
    S.met = v;
    cOut();
  },
  bls = (v) => {
    S.base = v;
    cOut();
  };
function validNumber(raw, min, max = 1e7) {
  const n = Number(raw);
  if (String(raw).trim() === '' || !Number.isFinite(n) || n < min || n > max)
    throw Error('Enter a finite number from ' + min + ' to ' + max);
  return n;
}
function setAssumption(el, key, min) {
  try {
    S[key] = validNumber(el.value, min);
    el.setCustomValidity('');
    cOut();
  } catch (e) {
    el.setCustomValidity(e.message);
    el.value = S[key];
    el.reportValidity();
  }
}
function setModelAssumption(el, id, key, min) {
  try {
    MODELS[id][key] = validNumber(el.value, min);
    el.setCustomValidity('');
    cOut();
  } catch (e) {
    el.setCustomValidity(e.message);
    el.value = MODELS[id][key];
    el.reportValidity();
  }
}
function setModelCycle(el, id, key) {
  try {
    MODELS[id].cyc[key] = validNumber(el.value, 0, 1e5);
    el.setCustomValidity('');
    cOut();
  } catch (e) {
    el.setCustomValidity(e.message);
    el.value = MODELS[id].cyc[key];
    el.reportValidity();
  }
}
function chart(k) {
  const ms = ids.filter((i) => S.sel.includes(i)),
    ws = WL.filter((w) => S.wls.includes(w.id));
  if (!ms.length || !ws.length) return '';
  const d = ws.map((w) =>
      ms.map((i) => {
        const m = met(i, w);
        return m.ok ? m[k] : null;
      })
    ),
    mx = Math.max(...d.flat().filter(Number.isFinite), 1),
    gw = 720 / ws.length,
    bw = Math.min(34, (gw - 14) / ms.length);
  let o = '';
  ws.forEach((w, j) =>
    ms.forEach((i, n) => {
      const v = d[j][n],
        h = v == null ? 0 : (v / mx) * 190,
        x = 50 + j * gw + (gw - bw * ms.length) / 2 + n * bw;
      o +=
        v == null
          ? `<text x="${x + bw / 2 - 1}" y="220" text-anchor="middle" style="font-size:9px">✗</text>`
          : `<rect x="${x}" y="${220 - h}" width="${bw - 2}" height="${h}" fill="${MODELS[i].col}"><title>${MODELS[i].name}: ${f(v)}</title></rect><text x="${x + bw / 2 - 1}" y="${216 - h}" text-anchor="middle" style="font-size:10px">${f(v, 1)}</text>`;
    })
  );
  ws.forEach(
    (w, j) =>
      (o += `<text x="${50 + j * gw + gw / 2}" y="240" text-anchor="middle" style="font-size:11px">${w.id}</text>`)
  );
  return `<svg viewBox="0 0 780 250" width="100%" role="img" aria-label="${Object.values(MK).find((v) => v[1] === k)?.[0] || k} by workload"><line x1="45" y1="220" x2="775" y2="220" stroke="var(--bd)"/>${o}</svg><div class="sm">${ms.map((i) => `<span class="chip"><span style="color:${MODELS[i].col}">■</span> ${MODELS[i].name}</span>`).join('')}</div>`;
}
function cOut() {
  const ms = ids.filter((i) => S.sel.includes(i)),
    w = W_(S.foc),
    sm = ms.map((i) => met(i, w));
  if (!$('#co')) return;
  if (ms.length < 1) {
    $('#co').innerHTML = '<p>Select at least one model.</p>';
    return;
  }
  const bs = ms.includes(S.base) ? S.base : ms[0],
    bm = met(bs, w),
    cats = Object.keys(CC);
  const ex = () => {
    if (ms.length < 2) return '<li>Select two or more models to compare.</li>';
    if (sm.filter((m) => m.ok).length < 2) return '<li>Not enough verified outputs to rank the models.</li>';
    const by = (k) =>
        sm
          .map((m, i) => [ms[i], m])
          .filter((x) => x[1].ok)
          .sort((a, b) => a[1][k] - b[1][k]),
      n = (i) => MODELS[i].name,
      winners = (k) => {
        const a = by(k),
          v = a[0][1][k];
        return a
          .filter((x) => Math.abs(x[1][k] - v) < 1e-9)
          .map((x) => n(x[0]))
          .join(' and ');
      },
      best = (k) => by(k)[0][1][k];
    return `<li>${w.n}: fewest dynamic instructions: <b>${winners('dyn')}</b> (${best('dyn')}); fewest modeled cycles: <b>${winners('cyc')}</b> (${best('cyc')}). The two rankings can differ because cycles per instruction (CPI) come from assumed per-class costs.</li><li>Smallest modeled code: <b>${winners('size')}</b> (${by('size')[0][1].size} bytes). Instruction count and bytes differ because encoding widths differ (SUBLEQ 12 bytes, RISC models 4 bytes, x86 sizes estimated here).</li><li>Lowest estimated energy: <b>${winners('e')}</b> (${f(by('e')[0][1].e, 1)} nJ) = assumed power × modeled time, so it moves when you edit the assumptions above.</li><li>These conclusions hold for these subsets, programs and assumptions only. They do not rank real commercial processors.</li>`;
  };
  $('#co').innerHTML =
    `${sm.some((m) => !m.ok) ? '<p class="bad">Warning: one or more models produced an incorrect output. Failed results are not eligible for rankings.</p>' : ''}<div class="card sc"><h3>${w.n}: ${w.task}</h3><table><tr><th>Metric</th><th>Unit</th>${ms.map((i) => `<th>${MODELS[i].name}</th>`).join('')}</tr><tr><td>Output (expected ${w.ex})</td><td>–</td>${sm.map((m) => `<td>${m.got} ${m.ok ? '<span class="ok">✓</span>' : '<span class="bad">✗</span>'}</td>`).join('')}</tr>${KP.map((k) => `<tr class="${['CPI (multicycle)', 'Pipeline CPI', 'Data reads', 'Data writes', 'Data footprint', 'Assumed power', 'Development effort', 'Static instructions'].includes(k[0]) ? 'adv' : ''}"><td>${k[0]} ${k[2]}</td><td>${k[1]}</td>${sm.map((m, j) => `<td>${!m.ok ? 'N/A (invalid result)' : k[0].startsWith('Five-stage') || k[0] === 'Pipeline CPI' ? (m.pipeCycles == null ? '<span class="mu">not modelled</span>' : f(k[3](m), 3)) : f(k[3](m)) + (k[0] === 'Code size' && ms[j] === 'x86' ? ' ' + BE : '')}</td>`).join('')}</tr>`).join('')}</table><p class="sm mu">${BT} counted from the interpreter run · ${BC} derived from those counts and the stated assumptions: multicycle cycles = Σ (instructions per class × cycles per class), CPI = cycles ÷ dynamic instructions, time = cycles ÷ clock, AMAT = hit time + miss rate × miss penalty; pipeline cycles come from the five-stage model (forwarding ${PIPE_FORWARD ? 'on' : 'off'}, branch penalty ${PIPE_BRANCH} on ${PIPE_POLICY === 'taken' ? 'taken branches' : 'every branch'}) · ${BE} energy = assumed power × modelled time and labour = hours × rate are rough figures, not measurements · x86 code size is an estimate because x86 encoding is not implemented · ${BN} area, transistor counts, prices and measured power are not available and are never inferred.</p></div>
<div class="card"><h3>${MK[S.met][0]} by workload</h3>${chart(MK[S.met][1])}</div>
<div class="card"><h3>Data-cache outcomes: ${w.n} ${BT}${BA}</h3><div class="sc"><table><tr><th>Model</th><th>Accesses</th><th>Hits</th><th>Misses</th><th>Miss rate</th><th>AMAT</th></tr>${ms.map((i, j) => `<tr><td>${MODELS[i].name}</td><td>${sm[j].cache.accesses}</td><td>${sm[j].cacheHits}</td><td>${sm[j].cacheMisses}</td><td>${f(sm[j].cacheMissRate * 100, 1)}%</td><td>${f(sm[j].amat, 2)} cycles</td></tr>`).join('')}</table></div></div><div class="card"><h3>Instruction mix: ALU · memory · branch ${BT}</h3><p class="sm mu">SUBLEQ combines arithmetic, memory access and conditional branching in one instruction, so it is shown as a separate combined category rather than misclassified as a conventional split-ISA operation.</p>${ms
      .map((i, j) => {
        const m = sm[j],
          mix = {
            ALU: (m.cat.arith || 0) + (m.cat.move || 0),
            Memory: (m.cat.load || 0) + (m.cat.store || 0),
            Branch: m.cat.branch || 0,
            'Combined SUBLEQ': m.cat['sub+branch'] || 0,
          },
          colors = { ALU: '#a855f7', Memory: '#3730a3', Branch: '#d8b4fe', 'Combined SUBLEQ': '#4f46e5' };
        return `<div class="sm">${MODELS[i].name}</div><div style="display:flex;height:22px;margin:2px 0 8px;border-radius:4px;overflow:hidden">${Object.entries(
          mix
        )
          .map(([k, v]) =>
            v ? `<div title="${k}: ${v}" style="flex:${v};background:${colors[k]}"></div>` : ''
          )
          .join('')}</div><div class="sm">${Object.entries(mix)
          .map(([k, v]) => `${k}: ${v}`)
          .join(' · ')}</div>`;
      })
      .join('')}</div><div class="card"><h3>Detailed executed instruction mix: ${w.n} ${BT}</h3>${ms
      .map((i, j) => {
        const m = sm[j];
        return `<div class="sm">${MODELS[i].name}</div><div style="display:flex;height:22px;margin:2px 0 8px;border-radius:4px;overflow:hidden">${cats.map((c) => (m.cat[c] ? `<div title="${c}: ${m.cat[c]}" style="flex:${m.cat[c]};background:${CC[c]}"></div>` : '')).join('')}</div>`;
      })
      .join(
        ''
      )}<div class="sm">${cats.map((c) => `<span class="chip"><span style="color:${CC[c]}">■</span> ${c}</span>`).join('')}</div></div>
<div class="card sc adv"><h3>Ratios against baseline: ${MODELS[bs].name} (=1.00)</h3><table><tr><th>Metric</th>${ms.map((i) => `<th>${MODELS[i].name}</th>`).join('')}</tr>${['dyn', 'cyc', 't', 'e', 'size'].map((k) => `<tr><td>${MK[k] ? MK[k][0] : 'Dynamic instructions'}</td>${sm.map((m) => `<td>${m.ok && bm.ok && bm[k] !== 0 ? f(m[k] / bm[k]) + '×' : 'N/A'}</td>`).join('')}</tr>`).join('')}</table></div>
<div class="card"><h3>Why the results differ</h3><ul>${ex()}</ul></div>
<div class="card" id="repw"><h3>Report</h3><div class='row'><button class='b' onclick="printReport()">Print / save as PDF</button><button class='b s' onclick='dlRep()'>Download report (HTML)</button><button class='b s' onclick="dl('processor-lab-results.json',JSON.stringify(snap(ids.filter(i=>S.sel.includes(i))),null,1),'application/json')">Download JSON</button><button class='b s' onclick="dl('processor-lab-results.csv',csv(ids.filter(i=>S.sel.includes(i))),'text/csv')">Download CSV</button></div><p id='dm' class='sm mu'></p><div id='rpt'>${rep(ms)}<h3>Charts: cycles and energy by workload</h3>${chart('cyc')}${chart('e')}${DEF}</div><p class="sm mu adv">Reproducibility data (JSON) and results (CSV); copy and save:</p><textarea class="adv" id="js" rows="5" style="width:100%" readonly onclick="this.select()">${esc(JSON.stringify(snap(ms)))}</textarea><textarea class="adv" rows="4" style="width:100%" readonly onclick="this.select()">${esc(csv(ms))}</textarea></div>`;
}
function snap(ms) {
  return buildSnapshot({
    lab: VER,
    credit: 'Created by Student Seba Joe Salloum',
    settings: {
      clock_mhz: S.mhz,
      rate_usd_per_hour: S.rate,
      cache: { ...S.cache },
      pipeline: { forwarding: PIPE_FORWARD, branch_penalty: PIPE_BRANCH, branch_policy: PIPE_POLICY, applies_to: ['mips', 'rv'] },
      models: Object.fromEntries(
        ids.map((i) => [
          i,
          { version: MODELS[i].ver, power_w: MODELS[i].pw, hours: MODELS[i].hrs, cycles: MODELS[i].cyc },
        ])
      ),
    },
    workloads: WL,
    programs: PROG,
    limit: LIM,
    results: ms.flatMap((i) =>
      S.wls.map((id) => {
        const m = met(i, W_(id));
        return {
          model: i,
          workload: id,
          static: m.st,
          dynamic: m.dyn,
          cycles: m.cyc,
          cpi: m.cpi,
          pipeline_cycles: m.pipeCycles,
          pipeline_cpi: m.pipeCPI,
          time_ns: m.t,
          energy_nj: m.e,
          code_bytes: m.size,
          code_bytes_estimated: i === 'x86',
          cache_hits: m.cacheHits,
          cache_misses: m.cacheMisses,
          cache_miss_rate: m.cacheMissRate,
          amat_cycles: m.amat,
          output_ok: m.ok,
        };
      })
    ),
  });
}
function csv(ms) {
  return resultsToCSV(
    ms.flatMap((i) =>
      S.wls.map((id) => {
        const m = met(i, W_(id));
        return {
          model: i,
          workload: id,
          static: m.st,
          dynamic: m.dyn,
          cycles: m.cyc,
          cpi: f(m.cpi),
          pipeline_cycles: m.pipeCycles ?? '',
          pipeline_cpi: m.pipeCPI == null ? '' : f(m.pipeCPI, 3),
          time_ns: f(m.t),
          energy_nj: f(m.e),
          reads: m.rd,
          writes: m.wr,
          code_bytes: m.size,
          cache_hits: m.cacheHits,
          cache_misses: m.cacheMisses,
          cache_miss_rate: f(m.cacheMissRate),
          amat_cycles: f(m.amat),
          ok: m.ok,
        };
      })
    )
  );
}
function rep(ms) {
  const ws = WL.filter((w) => S.wls.includes(w.id));
  return `<div class="sm"><h2>Processor Lab: comparison report</h2><p><b>Created by Student Seba Joe Salloum</b> · ${VER} · ${new Date().toISOString().slice(0, 10)}</p><p>Settings ${BA}: ${S.mhz} MHz, $${S.rate}/hour; power ${ms.map((i) => MODELS[i].name + ' ' + MODELS[i].pw + ' W').join(', ')}; cycle costs ${ms.map((i) => MODELS[i].name + ' ' + Object.entries(MODELS[i].cyc).map(([k, v]) => k + '=' + v).join('/')).join('; ')}.</p><p>Five-stage pipeline (MIPS32, RV32I): forwarding ${PIPE_FORWARD ? 'on' : 'off'}, branch penalty ${PIPE_BRANCH} cycle(s) on ${PIPE_POLICY === 'taken' ? 'taken branches only' : 'every executed branch'}. Data cache: ${S.cache.cacheSize} B, ${S.cache.blockSize} B blocks, ${S.cache.associativity === 1 ? 'direct-mapped' : S.cache.associativity + '-way set-associative'}, ${S.cache.policy}, ${S.cache.writePolicy}, hit ${S.cache.hitTime} / miss penalty ${S.cache.missPenalty} cycles.</p><table><tr><th>Workload</th>${ms.map((i) => `<th>${MODELS[i].name}<br>instr / multicycle cycles / pipeline cycles / ns / nJ (est.) / bytes${i === 'x86' ? ' (est.)' : ''} / misses / AMAT</th>`).join('')}</tr>${ws
    .map(
      (w) =>
        `<tr><td>${w.n}</td>${ms
          .map((i) => {
            const m = met(i, w);
            return `<td>${m.dyn} / ${m.cyc} / ${m.pipeCycles ?? '–'} / ${f(m.t, 0)} / ${f(m.e, 1)} / ${m.size} / ${m.cacheMisses} / ${f(m.amat, 2)}${m.ok ? '' : ' ✗'}</td>`;
          })
          .join('')}</tr>`
    )
    .join('')}</table>${methodologyHtml()}</div>`;
}
/* levels, plain-language help, glossary */
const lb = (t) => `<div class="card plain"><b>In plain words.</b> ${t}</div>`,
  pb = (t) => `<div class="card pro"><b>Pro experiments.</b> ${t}</div>`;
const PLAIN = {
  over: lb(
    `A processor is the part of a computer that follows instructions one at a time. Different processors use different “instruction languages”. This lab runs the same small jobs on four of them so you can see what changes. New here? Pick one:<div class="row"><button class="b" onclick="pmStart()">Take the 5-step tour</button><button class="b s" onclick="openSim('sq','ADD')">Step through a program</button><button class="b s" onclick="go('cmp')">See the results</button></div>`
  ),
  build: lb(
    `Think of a processor as a tiny office. Memory is the filing cabinet, the program counter is a finger pointing at the current instruction, the control logic is the manager, and the ALU is the calculator.`
  ),
  oisc: lb(
    `Most processors know dozens of instructions. This one knows only one: subtract, then jump if the answer is zero or below. Press Execute with different numbers and watch whether the jump happens.`
  ),
  mod: lb(
    `Each card is a different way to design instructions. MIPS and RISC-V use small, uniform instructions; x86 allows richer instructions of varying length. “Subset” means this lab only implements a few of each.`
  ),
  exp: lb(
    `Pick an instruction to see what it does, how it is stored as bits, and which parts of the processor it uses. The four boxes at the bottom show why “how many instructions?” has four different answers.`
  ),
  sim: lb(
    `Press Step to run one instruction at a time. Watch the highlighted line, the purple memory cells that just changed, and the trace table below. When the program ends, the lab checks the answer for you.`
  ),
  bench: lb(
    `A benchmark is the same small job given to every processor, so you can compare their implementations. The programs are illustrative, not fully controlled performance benchmarks. Each card shows that processor’s program and whether it got the right answer.`
  ),
  cmp: lb(
    `Fewer instructions does not always mean faster. “Cycles” count the processor’s time-steps, and the numbers use teaching assumptions rather than real chip measurements. Read “Why the results differ” first, then explore the chart.`
  ),
};
const PRO = {
  cmp: pb(
    `Set the x86 “alum” cost to 1 and watch the cycle ranking change; drop SUBLEQ to 2 cycles per instruction and compare it with RISC-V; then list which conclusions survive. Use the JSON to reproduce a run exactly.`
  ),
  sim: pb(
    `Check the trace yourself: dynamic count equals trace length, and cycles equal the sum of per-class costs. Run the loop on x86 and watch ZF decide the jnz.`
  ),
  bench: pb(
    `On the loop workload, static count stays at 4–5 while dynamic count grows with N. On the two max workloads, the branch outcome changes the dynamic count by one or two instructions.`
  ),
};
const GLOSS = `<details class="card"><summary>Glossary: terms in plain English</summary><dl class="sm">${Object.entries(
  {
    ISA: 'Instruction set architecture: the list of operations software can ask a processor to do.',
    Microarchitecture: 'How a processor is actually built to carry out those operations.',
    PC: 'Program counter: holds the position of the next instruction.',
    ALU: 'Arithmetic logic unit: the calculator inside the processor.',
    Register: 'A tiny, very fast storage slot inside the processor.',
    OISC: 'One-instruction-set computer: only one kind of instruction.',
    'RISC / CISC': 'Few simple instructions (MIPS, RISC-V) versus many richer instructions (x86).',
    Branch: 'An instruction that may change which instruction runs next.',
    Cycle: 'One tick of the processor clock. Time = cycles ÷ clock speed.',
    CPI: 'Cycles per instruction: the average cycles each executed instruction takes.',
    Static: 'Instructions written in the program.',
    Dynamic: 'Instructions actually executed (loops repeat them).',
    Benchmark: 'The same job run on every model so the comparison is fair.',
    Assumption: 'A number chosen for teaching, not measured on real hardware.',
  }
)
  .map(([k, v]) => `<dt><b>${k}</b></dt><dd style="margin:0 0 6px 0">${v}</dd>`)
  .join('')}</dl></details>`;
const LV = [
  ['b', 'Beginner'],
  ['i', 'Intermediate'],
  ['p', 'Pro'],
];
function setLv(l) {
  document.body.dataset.lv = l;
  $('#lv').innerHTML = LV.map(
    (x) =>
      `<button class="${x[0] == l ? 'on' : ''}" aria-pressed="${x[0] == l}" onclick="setLv('${x[0]}')">${x[1]}</button>`
  ).join('');
  if (T) go(T);
}
/* quiz, predict, sandbox, what-if, export, presenter */
const QZ = {
  over: [
    'Which statement is true?',
    [
      'Fewer instructions always means faster',
      'Instruction count alone cannot show speed',
      'All processors use the same instructions',
    ],
    1,
    'Speed depends on cycles per instruction and clock rate, not instruction count alone.',
  ],
  build: [
    'Which part performs subtraction?',
    ['Program counter', 'ALU', 'Memory'],
    1,
    'The ALU does the arithmetic; the PC only tracks the next instruction.',
  ],
  oisc: [
    'SUBLEQ with A=5 and B=3: what happens?',
    [
      'B becomes −2 and the jump is taken',
      'B becomes 2 and the jump is taken',
      'B becomes −2 and no jump happens',
    ],
    0,
    '3 − 5 = −2, which is ≤ 0, so PC = C.',
  ],
  mod: [
    'Which model uses variable-length instructions?',
    ['MIPS32', 'RV32I', 'x86-64'],
    2,
    'MIPS32 and RV32I base instructions are fixed at 32 bits.',
  ],
  exp: [
    'A 4-line program runs its loop 5 times. What is the dynamic count?',
    ['4', 'More than 4: every executed instruction counts', 'The ISA size'],
    1,
    'Static counts lines written; dynamic counts instructions executed.',
  ],
  sim: [
    'What ends a simulation?',
    ['The PC leaving the program, or the instruction limit', 'Pressing Pause', 'Changing the speed'],
    0,
    'The engine halts when the PC leaves the program or the limit is reached.',
  ],
  bench: [
    'Why verify output before accepting a result?',
    ['A fast wrong answer means nothing', 'Charts require it', 'MIPS requires it'],
    0,
    'Every benchmark must produce the expected output first.',
  ],
  cmp: [
    'In this lab, energy equals…',
    ['Assumed power × execution time', 'Instruction count × clock', 'Hours × hourly rate'],
    0,
    'Hours × rate is development cost, a separate quantity.',
  ],
};
const qz = (t) =>
  `<div class='card'><b>Check yourself.</b> ${QZ[t][0]}<div class='row'>${QZ[t][1].map((o, i) => `<button class='b s' onclick="qAns('${t}',${i})">${o}</button>`).join('')}</div><div id='qr' class='sm'></div></div>`;
function qAns(t, i) {
  const q = QZ[t];
  $('#qr').innerHTML =
    (i == q[2] ? "<span class='ok'>Correct.</span> " : "<span class='bad'>Not quite.</span> ") + q[3];
}
function pred(g) {
  const w = W_(bW),
    k = $('#pm2').value,
    r = ids
      .map((i) => [i, met(i, w)])
      .filter((x) => x[1].ok)
      .map((x) => [x[0], x[1][k]])
      .sort((a, b) => a[1] - b[1]),
    best = r.length ? r[0][1] : null,
    wn = r.filter((x) => x[1] === best).map((x) => x[0]);
  if (!r.length) {
    $('#pd').textContent = 'No verified outputs are available for this workload.';
    return;
  }
  $('#pd').innerHTML =
    `<p>${wn.includes(g) ? "<span class='ok'>Correct.</span>" : "<span class='bad'>Not this time.</span>"} Lowest: <b>${wn.map((i) => MODELS[i].name).join(', ')}</b> (${f(best)}). All: ${r.map((x) => MODELS[x[0]].name + ' ' + f(x[1])).join(' · ')}.</p><p class='sm'>Rankings change with the metric: instruction count ignores the cost of each instruction (cycle costs are assumptions), and code size depends on instruction encoding; x86 byte sizes here are estimates.</p>`;
}
PLAIN.sbx = lb(
  'Write or edit a small program for any model, set the starting memory, and run it on the same engine the benchmarks use. The result shows the output (memory cell 3) and every step.'
);
let xM = 'sq';
VIEW.sbx = () =>
  `<h1>Program sandbox</h1><div class='row'>${sel('xm', mO, xM, 'xSet')}<button class='b s' onclick="xLoad('ADD')">Load add</button><button class='b s' onclick="xLoad('SUMN')">Load loop</button><button class='b s' onclick="xLoad('MAX')">Load max</button><button class='b s' onclick="xLoad('ARR')">Load array sum</button></div><textarea id='xp' rows='10' style='width:100%;font:13px ui-monospace,Menlo,monospace'></textarea><div class='row'>Starting memory (cell:value) <input id='xmm' value='0:7,1:5' style='width:220px'><button class='b' onclick='xRun()'>Run</button></div><div id='xo'></div><p class='sm mu'>Output is cell 3. SUBLEQ uses cell names A,B,C,OUT,T,D,E,Z,ONE or numbers, and n for next. Registers start at 0. Limit ${LIM} instructions. Allowed operations depend on the model; unknown ones are reported.</p>`;
POST.sbx = () => xLoad('ADD');
function xSet(v) {
  xM = v;
  xLoad('ADD');
}
function xLoad(k) {
  $('#xp').value = PROG[k][xM].join('\n');
  const w = WL.find((x) => x.p == k);
  $('#xmm').value = Object.entries(w.mem)
    .map((e) => e.join(':'))
    .join(',');
}
function xRun() {
  const mm = {};
  let s;
  try {
    for (const pair of $('#xmm').value.split(',')) {
      if (!pair.trim()) continue;
      const m = pair.trim().match(/^(\d+)\s*:\s*(-?\d+)$/);
      if (!m) throw Error('Invalid memory entry ' + pair + '; expected cell:value');
      const a = +m[1],
        v = +m[2];
      if (a < 0 || a >= 16 || !Number.isSafeInteger(v) || v < -2147483648 || v > 2147483647)
        throw Error('Memory cell or value out of range: ' + pair);
      mm[a] = v;
    }
    const source = $('#xp').value.split('\n');
    s = mk(xM, { mem: mm }, source);
    while (!s.halt) step(s);
  } catch (e) {
    $('#xo').innerHTML = `<p class='bad'>Could not run: ${esc(String(e))}</p>`;
    return;
  }
  $('#xo').innerHTML =
    `<p>Dynamic ${s.c.dyn} · modeled cycles ${s.c.cyc} ${BA} · OUT = <b>${s.m[3]}</b>${s.err ? ` · <span class='bad'>${esc(s.err)}</span>` : ''}</p>${memV(s)}<div class='sc'><table><tr><th>#</th><th>PC</th><th>Instruction</th><th>Effect</th></tr>${s.tr
      .slice(-40)
      .map(
        (t) =>
          `<tr><td>${t.n}</td><td>${t.pc}</td><td><code>${esc(t.t)}</code></td><td>${esc(t.note)}</td></tr>`
      )
      .join('')}</table></div>`;
}
function wiM(v) {
  $('#wk').innerHTML = Object.keys(MODELS[v].cyc)
    .map((k) => `<option>${k}</option>`)
    .join('');
  wiDraw();
}
function wiDraw() {
  if (!$('#wi')) return;
  const m = $('#wm').value;
  if (!$('#wk').options.length) {
    wiM(m);
    return;
  }
  const k = $('#wk').value,
    w = W_(S.foc),
    ms = ids.filter((i) => S.sel.includes(i)),
    old = MODELS[m].cyc[k],
    P = [];
  for (let v = 1; v <= 8; v++) {
    MODELS[m].cyc[k] = v;
    P.push(ms.map((i) => met(i, w).cyc));
  }
  MODELS[m].cyc[k] = old;
  const mx = Math.max(...P.flat(), 1),
    si = ms.indexOf(m),
    mn = (j) => Math.min(...P[j].filter((_, n) => n != si));
  let fl = -1;
  if (si >= 0 && ms.length > 1) fl = P.findIndex((p, j) => j && p[si] <= mn(j) != P[j - 1][si] <= mn(j - 1));
  $('#wi').innerHTML =
    `<svg viewBox='0 0 780 220' width='100%' role='img' aria-label='Cycles as one assumption changes'><line x1='50' y1='190' x2='770' y2='190' stroke='var(--bd)'/>${ms.map((i, n) => `<polyline fill='none' stroke='${MODELS[i].col}' stroke-width='${i == m ? 4 : 2}' points='${P.map((p, j) => 60 + j * 95 + ',' + (190 - (p[n] / mx) * 160)).join(' ')}'/>`).join('')}${P.map((p, j) => `<text x='${60 + j * 95}' y='208' text-anchor='middle'>${j + 1}</text>`).join('')}<text x='6' y='20'>${mx} cycles</text></svg><div class='sm'>${ms.map((i) => `<span class='chip'><span style='color:${MODELS[i].col}'>■</span> ${MODELS[i].name}</span>`).join('')}</div><p class='sm'>${fl > 0 ? `The swept model’s position against the best other model flips when ${k} moves from ${fl} to ${fl + 1} cycles.` : 'Within 1 to 8 cycles, the swept model keeps the same position against the best other model on this workload.'} Thick line = swept model; others keep their current assumptions.</p>`;
}
{
  const o = cOut;
  cOut = function () {
    o();
    wiDraw();
  };
}
const DEF = `<h3>Defend every number</h3><table><tr><th>Number</th><th>Kind</th><th>Where to verify</th></tr><tr><td>Static and dynamic instructions, reads and writes, footprint</td><td>${BT}</td><td>Execution Simulator trace</td></tr><tr><td>Code size</td><td>${BA}</td><td>Encodings in Instruction Explorer (12-byte SUBLEQ teaching format; fixed 4 bytes MIPS32/RV32I; x86 approximate form sizes, not verified binary encodings)</td></tr><tr><td>Cycles, CPI, time, energy</td><td>${BA}</td><td>Counts from the trace multiplied by editable costs; time = cycles ÷ clock; energy = power × time</td></tr><tr><td>Development effort, labor cost</td><td>${BA}</td><td>Hours × hourly rate (educational model only)</td></tr><tr><td>RV32I has 40 base instructions</td><td>${BI}</td><td>RISC-V specification (S1)</td></tr><tr><td>Area, transistors, prices</td><td>${BN}</td><td>No identified implementation</td></tr></table>`;
function dl(n, t, m) {
  try {
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([t], { type: m }));
    a.download = n;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 3000);
    if ($('#dm'))
      $('#dm').textContent =
        'Download started. If nothing downloads in this view, use Print / save as PDF or copy the data from the boxes below.';
  } catch (e) {
    if ($('#dm')) $('#dm').textContent = 'Downloads are blocked here: use Print / save as PDF.';
  }
}
function dlRep() {
  dl(
    'processor-lab-report.html',
    '<!doctype html><meta charset="utf-8"><title>Processor Lab report</title><style>body{font:14px system-ui;max-width:900px;margin:20px auto;padding:0 12px}table{border-collapse:collapse}td,th{border:1px solid #ccc;padding:4px}svg text{fill:#111;font:11px sans-serif}</style>' +
      $('#rpt').innerHTML,
    'text/html'
  );
}
function printReport() {
  const r = $('#rpt');
  if (!r) return;
  $('#print-root').innerHTML = '<h1>Processor Lab — comparison report</h1>' + r.innerHTML;
  document.body.classList.add('pr');
  window.print();
}
window.addEventListener('afterprint', () => {
  document.body.classList.remove('pr');
  $('#print-root').innerHTML = '';
});
const PT = [
  [
    'Say: “A processor is memory, a program counter, an ALU and control logic. The ISA is what software sees; the microarchitecture is how it is built.”',
    'Click: Replay animation and point at each block.',
    'Likely question: “Is an ISA the same as a chip?” Answer: No. An ISA is a specification that many different chips can implement, so results must name the modeled implementation.',
  ],
  [
    'Say: “SUBLEQ has one instruction: subtract, then branch if the result is ≤ 0. Sequences of it build copy, add and loops.”',
    'Click: Execute 5, 3 (taken), then 2, 7 (not taken).',
    'Likely question: “Does one instruction type mean one execution?” Answer: No. Addition takes 3 SUBLEQ executions here.',
  ],
  [
    'Say: “I will step the same addition on one model, then another, and verify the output.”',
    'Click: Step; point at the changed memory cells and the verified result.',
    'Likely question: “Are the animations pre-scripted?” Answer: No. They follow the engine state, and speed never changes results.',
  ],
  [
    'Say: “Same inputs and expected outputs on four models. Now compare instructions, cycles, size and energy.”',
    'Click: change the chart metric and the baseline.',
    'Likely question: “Why is SUBLEQ slower with fewer instructions?” Answer: Each SUBLEQ costs 5 cycles in this model and does three memory accesses. Those costs are editable assumptions.',
  ],
  [
    'Say: “Instruction count, speed, energy and cost are different things. Every number is a trace result, an ISA fact or a labeled assumption.”',
    'Click: open the report and show the “Defend every number” table.',
    'Likely question: “Which processor is best?” Answer: Only within these declared models and assumptions. The lab makes no universal ranking.',
  ],
  [
    'Say: “Three short experiments, each computed live: two RISC ISAs on the same algorithm, the same program with and without forwarding, and one access pattern on three caches.”',
    'Click: Run experiment, then Step through the interesting cycles or accesses; finish on the Explanation box.',
    'Likely question: “Are these numbers measured?” Answer: No. Counts are simulated; cycles, CPI and AMAT are calculated from stated, editable assumptions. The pipeline also checks every forwarded value against the interpreter.',
  ],
];
/* presentation */
const PM = [
  ['build', '1. Explain the processor: how memory, PC, ALU and control logic fit together.'],
  ['oisc', '2. Introduce its instructions: SUBLEQ and what one instruction type can express.'],
  ['sim', '3. Execute a program: step through and verify the output.'],
  ['cmp', '4. Compare results: instructions, cycles, size, energy.'],
  ['over', '5. Discuss trade-offs: what the evidence does and does not establish.'],
  ['demo', '6. Run the professor experiments: ISA comparison, forwarding, cache.'],
];
let pi = 0;
function pmStart() {
  pi = 0;
  $('#pm').classList.add('on');
  pmShow();
}
function pmShow() {
  go(PM[pi][0]);
  $('#pmt').textContent = PM[pi][1];
  $('#v').insertAdjacentHTML(
    'afterbegin',
    `<div class='card' style='border-left:5px solid var(--ch)'><b>Presenter notes</b><p class='sm'>${PT[pi].join("</p><p class='sm'>")}</p></div>`
  );
}
function pmGo(d) {
  pi = Math.max(0, Math.min(PM.length - 1, pi + d));
  pmShow();
}
function pmEnd() {
  $('#pm').classList.remove('on');
}

