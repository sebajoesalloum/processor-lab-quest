/* Visual instruction execution and datapath (Feature 2).
   Shows the last instruction executed by the Execution Simulator, phase by phase, on the
   datapath of the selected architecture. Every value comes from describeInstruction(),
   which reads the interpreter's trace record. */
const DP = { phase: 0, byPhase: true, timer: null };
function dpStop() {
  clearInterval(DP.timer);
  DP.timer = null;
}
function dpPhase(d) {
  dpStop();
  DP.phase = Math.max(0, Math.min(5, DP.phase + d));
  simDraw();
}
function dpPhaseGo(n) {
  dpStop();
  DP.phase = n;
  simDraw();
}
function dpPlayPhases() {
  if (DP.timer) {
    dpStop();
    simDraw();
    return;
  }
  if (DP.phase >= 5) DP.phase = 0;
  DP.timer = setInterval(() => {
    if (!document.getElementById('dpwrap') || DP.phase >= 5) {
      dpStop();
      if (document.getElementById('dpwrap')) simDraw();
      return;
    }
    DP.phase++;
    simDraw();
  }, 1300);
  simDraw();
}
function dpSvg(arch, phase, all) {
  const L = DATAPATH_LAYOUTS[arch];
  const active = new Set(),
    unused = new Set(),
    labels = {};
  if (phase) {
    const list = all ? all : [phase];
    list.forEach((p) => {
      p.active.forEach((a) => active.add(a));
      Object.assign(labels, p.wires);
    });
    phase.unused.forEach((u) => unused.add(u));
    if (all) all.forEach((p) => p.unused.forEach((u) => unused.add(u)));
  }
  const wires = Object.entries(L.wires)
    .map(([id, [d, lx, ly]]) => {
      const on = id in labels;
      return `<path d="${d}" class="dpw${on ? ' on' : ''}"${on ? ' marker-end="url(#dpa-on)"' : ' marker-end="url(#dpa)"'}/>${on && labels[id] ? `<text x="${lx}" y="${ly}" class="dpl">${esc(labels[id])}</text>` : ''}`;
    })
    .join('');
  const nodes = Object.entries(L.nodes)
    .map(([id, n]) => {
      const cls = active.has(id) ? 'on' : unused.has(id) ? 'off' : '';
      if (n.mux)
        return `<g class="dpn mux ${cls}"><title>${esc(n.label)} multiplexer</title><path d="M${n.x} ${n.y} L${n.x + n.w} ${n.y + 8} V${n.y + n.h - 8} L${n.x} ${n.y + n.h} Z"/><text x="${n.x + n.w / 2}" y="${n.y + n.h + 13}" text-anchor="middle" class="dps">${esc(n.label)}</text></g>`;
      if (id === 'alu' && arch !== 'sq')
        return `<g class="dpn ${cls}"><path d="M${n.x} ${n.y} L${n.x + n.w} ${n.y + 25} V${n.y + n.h - 25} L${n.x} ${n.y + n.h} V${n.y + n.h / 2 + 12} L${n.x + 16} ${n.y + n.h / 2} L${n.x} ${n.y + n.h / 2 - 12} Z"/><text x="${n.x + n.w / 2 + 6}" y="${n.y + n.h / 2 + 4}" text-anchor="middle">${esc(n.label)}</text></g>`;
      return `<g class="dpn ${cls}"><rect x="${n.x}" y="${n.y}" width="${n.w}" height="${n.h}" rx="8"/><text x="${n.x + n.w / 2}" y="${n.y + (n.sub ? n.h / 2 - 3 : n.h / 2 + 4)}" text-anchor="middle">${esc(n.label)}</text>${n.sub ? `<text x="${n.x + n.w / 2}" y="${n.y + n.h / 2 + 13}" text-anchor="middle" class="dps">${esc(n.sub)}</text>` : ''}</g>`;
    })
    .join('');
  return `<svg class="dp2" viewBox="0 0 960 410" role="img" aria-label="${esc(L.title)}${phase ? ': ' + esc(phase.name) : ''}"><defs><marker id="dpa" markerWidth="8" markerHeight="8" refX="7" refY="4" orient="auto"><path d="M0 0 L8 4 L0 8 Z" class="dpa"/></marker><marker id="dpa-on" markerWidth="8" markerHeight="8" refX="7" refY="4" orient="auto"><path d="M0 0 L8 4 L0 8 Z" class="dpa on"/></marker></defs>${wires}${nodes}</svg>`;
}
function dpValues(d) {
  const row = (a, b) => `<tr><td>${a}</td><td>${b}</td></tr>`;
  let h = '';
  if (d.arch === 'mips' || d.arch === 'rv') h += row('PC', '0x' + d.pcByte.toString(16).toUpperCase().padStart(4, '0') + ' (instruction ' + d.index + ')');
  else h += row('PC', 'instruction ' + d.index);
  if (d.encoding) h += row('Machine word', '<code>' + d.encoding + '</code>');
  d.reads.forEach((r) => (h += row('Read ' + esc(r.role || 'operand'), esc(r.label) + ' = <b>' + r.value + '</b>')));
  if (d.subleq) h += row('Operands', `MEM[${d.subleq.a}] = ${d.subleq.va}, MEM[${d.subleq.b}] = ${d.subleq.vb}`);
  if (d.imm != null && d.kind !== 'branch') h += row('Immediate', String(d.imm));
  if (d.alu) h += row(d.alu.agu ? 'Address generation' : 'ALU', `${d.alu.a} ${d.alu.op === 'compare' ? 'vs' : d.alu.op} ${d.alu.b} → <b>${d.alu.result}</b>`);
  if (d.mem) h += row('Memory ' + d.mem.type, `address ${d.mem.address} (word ${d.mem.cell}) ${d.mem.type === 'read' ? '→ ' : '← '}<b>${d.mem.value}</b>${d.mem.old !== undefined && d.mem.type === 'write' ? ' (was ' + d.mem.old + ')' : ''}`);
  if (d.branch) h += row('Branch', `${d.branch.cond}: ${d.branch.taken ? '<b>taken</b>' : '<b>not taken</b>'}${d.branch.targetIndex != null ? ' · target instruction ' + d.branch.targetIndex : ''}`);
  if (d.flags && d.flags.after) h += row('Flags after', ['z', 's', 'o', 'c'].map((k) => k.toUpperCase() + 'F=' + +!!d.flags.after[k]).join(' '));
  if (d.write) h += row('Register write', d.write.discarded ? esc(d.write.label) + ' (hard-wired zero: discarded)' : `<b>${esc(d.write.label)} ← ${d.write.value}</b> (was ${d.write.old})`);
  h += row('Next PC', d.arch === 'mips' || d.arch === 'rv' ? '0x' + d.nextPcByte.toString(16).toUpperCase().padStart(4, '0') + ' (instruction ' + d.nextIndex + ')' : 'instruction ' + d.nextIndex);
  h += row('Cross-check', d.aluChecked ? '<span class="ok">✓ recomputed values match the interpreter</span>' : '<span class="bad">✗ mismatch with interpreter</span>');
  return `<table class="kv sm">${h}</table>`;
}
function dpControlTable(d) {
  if (!d.control) return '';
  return `<div class="sc"><table class="sm ctl"><tr>${Object.keys(d.control).map((k) => `<th>${k}</th>`).join('')}</tr><tr>${Object.values(d.control).map((v) => `<td>${v}</td>`).join('')}</tr></table></div>`;
}
function datapathPanel(s) {
  const arch = s.id,
    L = DATAPATH_LAYOUTS[arch];
  const t = s.tr[s.tr.length - 1];
  let d = null,
    phases = null,
    err = '';
  if (t) {
    try {
      d = describeInstruction(arch, t, s.p[t.pc]);
      phases = datapathPhases(d);
    } catch (e) {
      err = String(e.message || e);
    }
  }
  const conceptual = arch === 'x86' || arch === 'sq';
  const ph = phases ? phases[Math.min(DP.phase, phases.length - 1)] : null;
  const showAll = phases && !DP.byPhase;
  return `<div class="card" id="dpwrap"><h3>${esc(L.title)} ${conceptual ? '<span class="t na">Conceptual execution model</span>' : `<span class="t isa">Textbook datapath</span>`} ${BT}</h3><p class="sm mu">${esc(L.note)}</p>
<div class="row"><label class="sm"><input type="checkbox" ${DP.byPhase ? 'checked' : ''} onchange="DP.byPhase=this.checked;DP.phase=this.checked?0:5;simDraw()"> Show one phase at a time</label>${
    phases && DP.byPhase
      ? `<button class="b s" onclick="dpPhase(-1)" ${DP.phase === 0 ? 'disabled' : ''}>◀ Phase</button><button class="b" onclick="dpPhase(1)" ${DP.phase >= 5 ? 'disabled' : ''}>Phase ▶</button><button class="b s" onclick="dpPlayPhases()">${DP.timer ? '❚❚ Pause phases' : '▶ Animate phases'}</button>`
      : ''
  }</div>
${phases && DP.byPhase ? `<ol class="dp-phases">${phases.map((p, i) => `<li class="${i === DP.phase ? 'on' : i < DP.phase ? 'done' : ''}"><button type="button" onclick="dpPhaseGo(${i})">${i + 1}. ${p.name}</button></li>`).join('')}</ol>` : ''}
<div class="dp-grid"><div>${dpSvg(arch, showAll ? phases[5] : ph, showAll ? phases : null)}</div><div>${
    !t
      ? '<p>Press <b>Step</b> to execute the first instruction; its journey through the datapath appears here.</p>'
      : err
        ? `<p class="bad">${esc(err)}</p>`
        : `<p><b>Instruction #${s.c.dyn}:</b> <code>${esc(d.text)}</code></p><div class="dp-text" aria-live="polite">${showAll ? phases.map((p, i) => `<p class="sm"><b>${i + 1}. ${p.name}.</b> ${p.text}</p>`).join('') : `<p><b>${DP.phase + 1}. ${ph.name}.</b> ${ph.text}</p>`}</div>${dpValues(d)}${dpControlTable(d)}`
  }</div></div></div>`;
}
