/* Advanced cache visualisation (Feature 3).
   A reusable viewer: one access sequence, up to three cache configurations, step-by-step
   replay of one configuration, and a side-by-side comparison. Every displayed value comes
   from simulateCache(). */
const CV = {};
const CACHE_DEFAULT = { cacheSize: 64, blockSize: 16, associativity: 1, policy: 'LRU', writePolicy: 'write-back', writeAllocate: true, hitTime: 1, missPenalty: 20 };
const CACHE_PRESETS = {
  temporal: {
    name: 'Temporal locality',
    text: 'The same 8 words are read in 4 passes. After the first pass every word is already cached, so later passes hit: recently used data is likely to be used again.',
    pattern: { kind: 'repeated', words: 8, passes: 4 },
    configs: [{ ...CACHE_DEFAULT }],
  },
  spatial: {
    name: 'Spatial locality and block size',
    text: 'A 32-word array is read once. Each miss brings a whole block, so neighbouring words then hit. Bigger blocks exploit this spatial locality; 4-byte blocks cannot.',
    pattern: { kind: 'sequential', words: 32 },
    configs: [
      { ...CACHE_DEFAULT, cacheSize: 128, blockSize: 4 },
      { ...CACHE_DEFAULT, cacheSize: 128, blockSize: 16 },
      { ...CACHE_DEFAULT, cacheSize: 128, blockSize: 32 },
    ],
  },
  conflict: {
    name: 'Conflict misses vs associativity',
    text: 'Two addresses 64 bytes apart are read alternately. In a 64-byte direct-mapped cache they map to the same line and evict each other every time. Two ways let both stay.',
    pattern: { kind: 'conflict', words: 16, span: 64 },
    configs: [
      { ...CACHE_DEFAULT, associativity: 1 },
      { ...CACHE_DEFAULT, associativity: 2 },
      { ...CACHE_DEFAULT, associativity: 'full' },
    ],
  },
  replacement: {
    name: 'Replacement policy: LRU vs FIFO',
    text: 'Block 0 is reused constantly while blocks 2 and 4 alternate in the same 2-way set. LRU keeps the busy block 0; FIFO evicts it just because it was loaded first.',
    custom: '0 32 0 64 0 32 0 64 0 32 0 64',
    configs: [
      { ...CACHE_DEFAULT, associativity: 2, policy: 'LRU' },
      { ...CACHE_DEFAULT, associativity: 2, policy: 'FIFO' },
      { ...CACHE_DEFAULT, associativity: 2, policy: 'RANDOM' },
    ],
  },
  random: {
    name: 'Random access and capacity',
    text: '48 seeded pseudo-random word reads over a 256-byte region. There is little locality, so only a cache large enough to hold the region does well.',
    pattern: { kind: 'random', words: 48, region: 64, seed: 7 },
    configs: [
      { ...CACHE_DEFAULT, cacheSize: 64 },
      { ...CACHE_DEFAULT, cacheSize: 256 },
      { ...CACHE_DEFAULT, cacheSize: 256, associativity: 4 },
    ],
  },
  writes: {
    name: 'Write-back vs write-through',
    text: 'A loop writes the same 4 words repeatedly. Write-back marks lines dirty and writes memory only on eviction; write-through sends every store to memory.',
    custom: 'w0 w4 w8 w12 w0 w4 w8 w12 w0 w4 w8 w12 r64 r80',
    configs: [
      { ...CACHE_DEFAULT, cacheSize: 32, writePolicy: 'write-back' },
      { ...CACHE_DEFAULT, cacheSize: 32, writePolicy: 'write-through' },
    ],
  },
};
function cvCreate(key, cfg) {
  CV[key] = {
    key,
    accesses: cfg.accesses,
    sourceLabel: cfg.sourceLabel || '',
    configs: cfg.configs.map((c) => ({ ...CACHE_DEFAULT, ...c })),
    vis: 0,
    step: 0,
    timer: null,
    editable: cfg.editable !== false,
  };
  cvCompute(key);
  return CV[key];
}
function cvCompute(key) {
  const v = CV[key];
  v.error = '';
  try {
    v.results = v.configs.map((c) => simulateCache(v.accesses, c));
    v.step = Math.min(v.step, v.accesses.length);
    v.vis = Math.min(v.vis, v.configs.length - 1);
  } catch (e) {
    v.error = String(e.message || e);
    v.results = null;
  }
}
const cvName = (c, i) =>
  `${String.fromCharCode(65 + i)}: ${c.cacheSize} B, ${c.blockSize} B blocks, ${Number(c.associativity) === 1 ? 'direct-mapped' : c.associativity === 'full' || Number(c.associativity) === c.cacheSize / c.blockSize ? 'fully associative' : c.associativity + '-way'}, ${c.policy}, ${c.writePolicy}`;
function cvStep(key, d) {
  const v = CV[key];
  v.step = Math.max(0, Math.min(v.accesses.length, v.step + d));
  cvDraw(key);
}
function cvGoto(key, n) {
  cvPause(key);
  CV[key].step = Math.max(0, Math.min(CV[key].accesses.length, n));
  cvDraw(key);
}
function cvPlay(key) {
  const v = CV[key];
  if (v.timer || !v.results) return;
  if (v.step >= v.accesses.length) v.step = 0;
  v.timer = setInterval(() => {
    if (!document.getElementById(key)) return cvPause(key);
    if (v.step >= v.accesses.length) return cvPause(key, true);
    v.step++;
    cvDraw(key);
  }, 900);
  cvDraw(key);
}
function cvPause(key, redraw) {
  const v = CV[key];
  if (!v) return;
  clearInterval(v.timer);
  v.timer = null;
  if (redraw) cvDraw(key);
}
function cvStopAll() {
  Object.keys(CV).forEach((k) => cvPause(k));
}
function cvSetConfig(key, i, field, value) {
  const v = CV[key];
  cvPause(key);
  const c = v.configs[i];
  if (['cacheSize', 'blockSize', 'hitTime', 'missPenalty'].includes(field)) value = Number(value);
  if (field === 'associativity') value = value === 'full' ? 'full' : Number(value);
  if (field === 'writeAllocate') value = value === true || value === 'true';
  c[field] = value;
  if (c.blockSize > c.cacheSize) c.blockSize = c.cacheSize;
  const lines = c.cacheSize / c.blockSize;
  if (c.associativity !== 'full' && c.associativity > lines) c.associativity = lines;
  v.step = 0;
  cvCompute(key);
  cvDraw(key);
}
function cvAddConfig(key) {
  const v = CV[key];
  if (v.configs.length >= 3) return;
  v.configs.push({ ...v.configs[v.configs.length - 1] });
  cvCompute(key);
  cvDraw(key);
}
function cvRemoveConfig(key, i) {
  const v = CV[key];
  if (v.configs.length <= 1) return;
  v.configs.splice(i, 1);
  cvCompute(key);
  cvDraw(key);
}
function cvConfigEditor(v, c, i) {
  const k = v.key,
    lines = c.cacheSize / c.blockSize;
  const ways = [];
  for (let w = 1; w < lines; w *= 2) ways.push(String(w));
  ways.push(lines === 1 ? '1' : 'full');
  const o = (vals, cur, lab = (x) => x) => vals.map((x) => `<option value="${x}" ${String(x) === String(cur) ? 'selected' : ''}>${lab(x)}</option>`).join('');
  return `<div class="card cfg${i === v.vis ? ' vis' : ''}"><div class="row" style="justify-content:space-between"><b>Configuration ${String.fromCharCode(65 + i)}</b><span>${i === v.vis ? '<span class="t tr">shown below</span>' : `<button class="b s" onclick="CV['${k}'].vis=${i};CV['${k}'].step=0;cvDraw('${k}')">Visualise</button>`}${v.configs.length > 1 && v.editable ? ` <button class="b s" onclick="cvRemoveConfig('${k}',${i})" aria-label="Remove configuration ${String.fromCharCode(65 + i)}">✕</button>` : ''}</span></div>${
    v.editable
      ? `<div class="row sm"><label>Size <select onchange="cvSetConfig('${k}',${i},'cacheSize',this.value)">${o([16, 32, 64, 128, 256, 512, 1024], c.cacheSize, (x) => x + ' B')}</select></label><label>Block <select onchange="cvSetConfig('${k}',${i},'blockSize',this.value)">${o([4, 8, 16, 32, 64].filter((x) => x <= c.cacheSize), c.blockSize, (x) => x + ' B')}</select></label><label>Ways <select onchange="cvSetConfig('${k}',${i},'associativity',this.value)">${o(ways, lines > 1 && (c.associativity === 'full' || c.associativity === lines) ? 'full' : c.associativity, (x) => (x === 'full' ? 'fully assoc. (' + lines + ')' : x === '1' ? '1 (direct)' : x))}</select></label><label>Replace <select onchange="cvSetConfig('${k}',${i},'policy',this.value)">${o(CACHE_POLICIES, c.policy)}</select></label><label>Writes <select onchange="cvSetConfig('${k}',${i},'writePolicy',this.value)">${o(WRITE_POLICIES, c.writePolicy)}</select></label><label>Write miss <select onchange="cvSetConfig('${k}',${i},'writeAllocate',this.value)"><option value="true" ${c.writeAllocate ? 'selected' : ''}>allocate</option><option value="false" ${!c.writeAllocate ? 'selected' : ''}>no-allocate</option></select></label><label>Hit <input type="number" min="0" step="0.5" value="${c.hitTime}" onchange="cvSetConfig('${k}',${i},'hitTime',this.value)" style="width:60px"></label><label>Miss penalty <input type="number" min="0" value="${c.missPenalty}" onchange="cvSetConfig('${k}',${i},'missPenalty',this.value)" style="width:64px"></label></div>`
      : `<p class="sm">${esc(cvName(c, i))}; hit ${c.hitTime}, miss penalty ${c.missPenalty} cycles</p>`
  }</div>`;
}
function cvBits(v, g, a) {
  const bin = (n, w) => (w ? (n >>> 0).toString(2).padStart(w, '0').slice(-w) : '');
  return `<div class="addr" role="img" aria-label="Address ${a.address}: tag ${a.tag}, index ${a.index}, offset ${a.offset}"><span class="ab tag" style="flex:${g.tagBits}"><b>tag (${g.tagBits} bits) = ${a.tag}</b>${bin(a.tag, g.tagBits)}</span>${g.indexBits ? `<span class="ab idx" style="flex:${Math.max(g.indexBits, 2)}"><b>index (${g.indexBits}) = ${a.index}</b>${bin(a.index, g.indexBits)}</span>` : ''}<span class="ab off" style="flex:${Math.max(g.offsetBits, 2)}"><b>offset (${g.offsetBits}) = ${a.offset}</b>${bin(a.offset, g.offsetBits)}</span></div><p class="sm mu">${g.addressBits}-bit address ${a.address} = 0x${a.address.toString(16).toUpperCase()}. Block number = ⌊${a.address} ÷ ${g.blockSize}⌋ = ${a.block}; set = block mod ${g.sets} = ${a.index}; tag = ⌊block ÷ ${g.sets}⌋ = ${a.tag}.${g.indexBits === 0 ? ' Fully associative: there is only one set, so no index bits.' : ''}</p>`;
}
function cvTable(v, res, sets, cur) {
  const g = res;
  const policyCol = g.policy === 'LRU' ? 'last use' : g.policy === 'FIFO' ? 'loaded at' : 'loaded at';
  const rows = sets
    .map((set, si) => {
      const isSet = cur && cur.index === si;
      return `<tr class="${isSet ? 'cset' : ''}"><th scope="row">Set ${si}${isSet ? ' ◀' : ''}</th>${set
        .map((l, wi) => {
          const here = isSet && cur.way === wi;
          const cls = here ? (cur.hit ? 'hit' : 'miss') : '';
          const range = l.valid ? `${l.block * g.blockSize}–${l.block * g.blockSize + g.blockSize - 1}` : '';
          return `<td class="line ${cls} ${l.valid ? '' : 'inv'}"><div class="lb"><span title="valid bit">V=${+l.valid}</span><span title="dirty bit">D=${+l.dirty}</span><span>${l.valid ? 'tag ' + l.tag : 'empty'}</span></div><div class="sm">${l.valid ? 'block ' + l.block + ' · bytes ' + range : '—'}</div>${l.valid ? `<div class="sm mu">${policyCol} #${(g.policy === 'LRU' ? l.lastUse : l.filledAt) + 1}</div>` : ''}</td>`;
        })
        .join('')}</tr>`;
    })
    .join('');
  return `<div class="sc"><table class="cache-tbl"><tr><th>Set</th>${Array.from({ length: g.associativity }, (_, i) => `<th>Way ${i}</th>`).join('')}</tr>${rows}</table></div>`;
}
function cvMemStrip(v, res, upto, cur) {
  const blocks = [...new Set(v.accesses.map((a) => Math.floor(a.address / res.blockSize)))].sort((a, b) => a - b);
  if (blocks.length > 64) return `<p class="sm mu">${blocks.length} distinct memory blocks are touched (too many to draw).</p>`;
  const cached = new Set();
  if (upto) for (const s of upto.finalSets) for (const l of s) if (l.valid) cached.add(l.block);
  return `<div class="mstrip" aria-label="Memory blocks touched by the sequence">${blocks
    .map((b) => `<span class="mb ${cur && cur.block === b ? 'mcur' : ''} ${cached.has(b) ? 'in' : ''}" title="Block ${b}: bytes ${b * res.blockSize}–${(b + 1) * res.blockSize - 1}, maps to set ${b % res.sets}">B${b}<small>set ${b % res.sets}</small></span>`)
    .join('')}</div><p class="sm mu">Highlighted outline = block of the current access; filled = currently in the cache.</p>`;
}
function cvHistory(v, res) {
  const from = Math.max(0, v.step - 12);
  const rows = res.trace.slice(from, v.step);
  if (!rows.length) return '';
  return `<div class="sc"><table class="sm"><tr><th>#</th><th>Access</th><th>Tag / set / offset</th><th>Result</th><th>Why</th></tr>${rows
    .map(
      (t) =>
        `<tr class="${t.step === v.step - 1 ? 'cur-row' : ''}"><td>${t.step + 1}</td><td>${t.type === 'write' ? 'write' : 'read'} ${t.address}</td><td>${t.tag} / ${t.index} / ${t.offset}</td><td>${t.hit ? '<span class="ok">HIT</span>' : '<span class="bad">MISS</span>' + (t.missKind ? ' (' + t.missKind + ')' : '')}</td><td>${esc(t.action)}</td></tr>`
    )
    .join('')}</table></div>`;
}
function cvExplainMiss(t) {
  if (t.hit) return `The tag ${t.tag} matches a valid line in set ${t.index}, way ${t.way}: <b>HIT</b>.`;
  const why = { compulsory: 'first time this block is ever used (compulsory miss)', capacity: 'the block was used before but a fully associative cache of the same size would also have evicted it (capacity miss)', conflict: 'the block was evicted only because too many blocks map to this set; a fully associative cache of the same size would still hold it (conflict miss)' }[t.missKind];
  return `No valid line in set ${t.index} has tag ${t.tag}: <b>MISS</b> — ${why || 'write miss, not allocated'}.`;
}
function cvStats(r, label) {
  return `<div class="cache-metrics"><span class="chip">${label}</span><span class="chip">Accesses ${r.accesses}</span><span class="chip">Hits ${r.hits}</span><span class="chip">Misses ${r.misses}</span><span class="chip">Hit rate ${f(r.hitRate * 100, 1)}%</span><span class="chip">Miss rate ${f(r.missRate * 100, 1)}%</span><span class="chip">AMAT ${f(r.amat, 2)} cycles</span><span class="chip">Write-backs ${r.writebacks}</span></div>`;
}
function cvCompareText(v) {
  const R = v.results;
  if (R.length < 2) return '<p class="sm">Add a second configuration to compare.</p>';
  const out = [];
  const best = R.reduce((b, r, i) => (r.amat < R[b].amat ? i : b), 0);
  out.push(`Lowest AMAT: configuration <b>${String.fromCharCode(65 + best)}</b> (${f(R[best].amat, 2)} cycles).`);
  for (let i = 1; i < R.length; i++) {
    const a = R[0],
      b = R[i],
      L = String.fromCharCode(65 + i);
    const parts = [];
    const dc = a.missBreakdown.conflict - b.missBreakdown.conflict,
      dk = a.missBreakdown.compulsory - b.missBreakdown.compulsory,
      dp = a.missBreakdown.capacity - b.missBreakdown.capacity;
    if (dc) parts.push(`${Math.abs(dc)} ${dc > 0 ? 'fewer' : 'more'} conflict misses${b.associativity !== a.associativity ? ' (associativity ' + a.associativity + ' → ' + b.associativity + ' changes how many blocks a set can hold)' : b.policy !== a.policy ? ' (the ' + b.policy + ' policy chooses different victims)' : ''}`);
    if (dk) parts.push(`${Math.abs(dk)} ${dk > 0 ? 'fewer' : 'more'} compulsory misses${b.blockSize !== a.blockSize ? ' (each ' + b.blockSize + '-byte block brings ' + b.blockSize / 4 + ' words, so first touches are ' + (dk > 0 ? 'shared by more words' : 'shared by fewer words') + ')' : ''}`);
    if (dp) parts.push(`${Math.abs(dp)} ${dp > 0 ? 'fewer' : 'more'} capacity misses${b.cacheSize !== a.cacheSize ? ' (' + b.cacheSize + ' B instead of ' + a.cacheSize + ' B of storage)' : ''}`);
    if (a.writebacks !== b.writebacks || a.memoryWrites !== b.memoryWrites) parts.push(`memory writes ${a.memoryWrites + a.writebacks} → ${b.memoryWrites + b.writebacks} (write-backs ${a.writebacks} → ${b.writebacks}, write-through writes ${a.memoryWrites} → ${b.memoryWrites})`);
    out.push(`${L} vs A: ${parts.length ? parts.join('; ') : 'identical hit/miss behaviour on this sequence'}. Miss rate ${f(a.missRate * 100, 1)}% → ${f(b.missRate * 100, 1)}%, AMAT ${f(a.amat, 2)} → ${f(b.amat, 2)} cycles.`);
  }
  return `<ul class="sm">${out.map((x) => `<li>${x}</li>`).join('')}</ul>`;
}
function cvCompare(v) {
  const R = v.results;
  const mx = Math.max(...R.map((r) => r.amat), 1);
  const bars = R.map((r, i) => `<div class="hbar"><span>${String.fromCharCode(65 + i)}</span><div><i style="width:${(r.amat / mx) * 100}%"></i></div><b>${f(r.amat, 2)}</b></div>`).join('');
  return `<div class="sc"><table class="sm"><tr><th>Configuration</th><th>Hits</th><th>Misses</th><th>Hit rate</th><th>Miss rate</th><th>Compulsory / capacity / conflict</th><th>Write-backs</th><th>Memory writes</th><th>AMAT (cycles)</th></tr>${R.map(
    (r, i) => `<tr><td>${esc(cvName(v.configs[i], i))}</td><td>${r.hits}</td><td>${r.misses}</td><td>${f(r.hitRate * 100, 1)}%</td><td>${f(r.missRate * 100, 1)}%</td><td>${r.missBreakdown.compulsory} / ${r.missBreakdown.capacity} / ${r.missBreakdown.conflict}</td><td>${r.writebacks}</td><td>${r.memoryWrites}</td><td><b>${f(r.amat, 3)}</b> = ${r.hitTime} + ${f(r.missRate, 4)} × ${r.missPenalty}</td></tr>`
  ).join('')}</table></div><div class="hbars" role="img" aria-label="AMAT by configuration">${bars}</div><p class="sm mu">AMAT = hit time + miss rate × miss penalty (single-level, standard textbook definition). Write-back traffic and write-through memory writes are reported separately and are not added to AMAT. 3C classification: compulsory = first use of a block; capacity = also a miss in a fully associative LRU cache of the same size; conflict = all other misses.</p>${cvCompareText(v)}`;
}
function cvDraw(key) {
  const v = CV[key],
    root = document.getElementById(key);
  if (!root || !v) return;
  const k = key;
  if (!v.results) {
    root.innerHTML = `${v.configs.map((c, i) => cvConfigEditor(v, c, i)).join('')}<p class="bad" role="alert">${esc(v.error)}</p>`;
    return;
  }
  const res = v.results[v.vis],
    cfg = v.configs[v.vis];
  const upto = simulateCache(v.accesses.slice(0, v.step), cfg);
  const cur = v.step ? res.trace[v.step - 1] : null;
  root.innerHTML = `<div class="cfgs">${v.configs.map((c, i) => cvConfigEditor(v, c, i)).join('')}${v.editable && v.configs.length < 3 ? `<button class="b s" onclick="cvAddConfig('${k}')">+ Add configuration to compare</button>` : ''}</div>
<div class="card"><h3>Step-by-step: configuration ${String.fromCharCode(65 + v.vis)} ${BT}</h3><p class="sm">${esc(cvName(cfg, v.vis))} · ${res.lines} lines in ${res.sets} set(s) of ${res.associativity} way(s) · ${v.accesses.length} accesses${v.sourceLabel ? ' · ' + esc(v.sourceLabel) : ''}</p>
<div class="row"><button class="b s" onclick="cvPause('${k}');cvGoto('${k}',0)">⏮ Reset</button><button class="b s" onclick="cvPause('${k}');cvStep('${k}',-1)" ${v.step === 0 ? 'disabled' : ''}>◀ Back</button><button class="b" onclick="cvPause('${k}');cvStep('${k}',1)" ${v.step >= v.accesses.length ? 'disabled' : ''}>Next access ▶</button>${v.timer ? `<button class="b s" onclick="cvPause('${k}',true)">❚❚ Pause</button>` : `<button class="b s" onclick="cvPlay('${k}')">▶ Play</button>`}<button class="b s" onclick="cvGoto('${k}',${v.accesses.length})">End ⏭</button><label class="sm">Access <input type="range" min="0" max="${v.accesses.length}" value="${v.step}" oninput="cvGoto('${k}',+this.value)" aria-label="Access number"> <b>${v.step}</b> / ${v.accesses.length}</label></div>
${cvStats(upto, 'So far')}
${cur ? `<div class="cv-now" aria-live="polite"><p><b>Access ${v.step}:</b> ${cur.type} address <b>${cur.address}</b> → set ${cur.index} → ${cur.hit ? '<span class="ok">HIT</span>' : '<span class="bad">MISS</span>'}. ${cvExplainMiss(cur)} ${esc(cur.action)}${cur.victim ? ` <b>Replacement:</b> way ${cur.victim.way} (block ${cur.victim.block}, tag ${cur.victim.tag}) chosen by ${res.policy}${cur.victim.writeback ? ', dirty → written back' : ''}.` : ''}</p>${cvBits(v, res, cur)}</div>` : `<p class="sm">Press <b>Next access</b> to send the first address to the cache. Sequence: <code>${esc(v.accesses.slice(0, 24).map((a) => (a.type === 'write' ? 'w' : '') + a.address).join(' '))}${v.accesses.length > 24 ? ' …' : ''}</code></p>`}
${cvTable(v, res, upto.finalSets, cur)}${cvMemStrip(v, res, upto, cur)}${cvHistory(v, res)}</div>
<div class="card"><h3>Results and comparison (full sequence) ${BT}${BA}</h3>${cvCompare(v)}</div>`;
}
/* ---------- Cache Lab tab ---------- */
let CL = { preset: 'conflict', src: 'pattern', pattern: { kind: 'conflict', words: 16, span: 64 }, custom: '0 4 8 12 0 4 64 68 0 4', model: 'rv', workload: 'ARR_LOOP' };
function clAccesses() {
  if (CL.src === 'custom') return { list: parseAccessList(CL.custom), label: 'custom address list' };
  if (CL.src === 'trace') {
    const w = W_(CL.workload),
      s = mk(CL.model, w);
    while (!s.halt) step(s);
    if (!s.accesses.length) throw Error('This program makes no data-memory accesses.');
    return { list: s.accesses.map((a) => ({ address: a.address, type: a.type })), label: `data accesses of ${MODELS[CL.model].name} running ${w.n}` };
  }
  return { list: cachePattern(CL.pattern.kind, CL.pattern), label: CACHE_PATTERNS[CL.pattern.kind] };
}
function clLoadPreset(id) {
  const p = CACHE_PRESETS[id];
  CL.preset = id;
  if (p.custom) {
    CL.src = 'custom';
    CL.custom = p.custom;
  } else {
    CL.src = 'pattern';
    CL.pattern = { ...p.pattern };
  }
  clBuild(p.configs);
}
function clBuild(configs) {
  const msg = document.getElementById('cl-msg');
  try {
    const a = clAccesses();
    cvCreate('cl-view', { accesses: a.list, sourceLabel: a.label, configs: configs || CV['cl-view']?.configs || [{ ...CACHE_DEFAULT }] });
    if (msg) msg.textContent = '';
    clDrawSource();
    cvDraw('cl-view');
  } catch (e) {
    if (msg) msg.textContent = String(e.message || e);
  }
}
function clDrawSource() {
  const el = document.getElementById('cl-src');
  if (!el) return;
  const p = CACHE_PRESETS[CL.preset];
  const pat = CL.pattern;
  el.innerHTML = `<div class="row">${Object.entries(CACHE_PRESETS)
    .map(([id, x]) => `<button class="b ${CL.preset === id ? '' : 's'}" onclick="clLoadPreset('${id}')">${x.name}</button>`)
    .join('')}</div>${p ? `<p class="sm plainish"><b>${p.name}.</b> ${p.text}</p>` : ''}
<div class="row"><label>Access sequence <select onchange="CL.src=this.value;CL.preset='';clBuild()"><option value="pattern" ${CL.src === 'pattern' ? 'selected' : ''}>Generated pattern</option><option value="trace" ${CL.src === 'trace' ? 'selected' : ''}>A benchmark program's data accesses</option><option value="custom" ${CL.src === 'custom' ? 'selected' : ''}>Custom address list</option></select></label>${
    CL.src === 'pattern'
      ? `<label>Pattern <select onchange="CL.pattern.kind=this.value;CL.preset='';clBuild()">${Object.entries(CACHE_PATTERNS).map(([k, t]) => `<option value="${k}" ${pat.kind === k ? 'selected' : ''}>${t.split(':')[0]}</option>`).join('')}</select></label><label>Count <input type="number" min="1" max="256" value="${pat.words ?? 16}" onchange="CL.pattern.words=Math.max(1,Math.min(256,+this.value||1));CL.preset='';clBuild()" style="width:64px"></label>${['repeated', 'strided', 'matrix'].includes(pat.kind) ? `<label>Passes <input type="number" min="1" max="8" value="${pat.passes ?? 3}" onchange="CL.pattern.passes=Math.max(1,Math.min(8,+this.value||1));CL.preset='';clBuild()" style="width:56px"></label>` : ''}${pat.kind === 'strided' ? `<label>Stride <input type="number" min="4" step="4" value="${pat.stride ?? 16}" onchange="CL.pattern.stride=Math.max(4,Math.round((+this.value||4)/4)*4);CL.preset='';clBuild()" style="width:64px"> B</label>` : ''}${pat.kind === 'conflict' ? `<label>Distance <input type="number" min="4" step="4" value="${pat.span ?? 64}" onchange="CL.pattern.span=Math.max(4,Math.round((+this.value||4)/4)*4);CL.preset='';clBuild()" style="width:64px"> B</label>` : ''}${pat.kind === 'random' ? `<label>Seed <input type="number" value="${pat.seed ?? 7}" onchange="CL.pattern.seed=Math.round(+this.value)||1;CL.preset='';clBuild()" style="width:64px"></label>` : ''}`
      : CL.src === 'trace'
        ? `<label>Model ${`<select onchange="CL.model=this.value;clBuild()">${mO.map((o) => `<option value="${o[0]}" ${o[0] === CL.model ? 'selected' : ''}>${o[1]}</option>`).join('')}</select>`}</label><label>Workload <select onchange="CL.workload=this.value;clBuild()">${wO.map((o) => `<option value="${o[0]}" ${o[0] === CL.workload ? 'selected' : ''}>${o[1]}</option>`).join('')}</select></label>`
        : `<label style="flex:1">Addresses <input id="cl-custom" value="${esc(CL.custom)}" style="width:100%" aria-describedby="cl-help"></label><button class="b" onclick="CL.custom=document.getElementById('cl-custom').value;CL.preset='';clBuild()">Use list</button><span id="cl-help" class="sm mu">bytes, e.g. 0 4 w8 0x40 (w = write)</span>`
  }</div><p id="cl-msg" class="bad sm" role="alert"></p>`;
}
VIEW.cache = () =>
  `<h1>Cache lab</h1><p class="mu">Send a sequence of memory addresses to one, two or three caches and watch every lookup: how the address splits into tag, index and offset, which set it selects, whether a line matches, and what gets replaced. All values are computed by the cache simulator.</p><div class="card" id="cl-src"></div><div id="cl-view"></div>`;
POST.cache = () => {
  clDrawSource();
  if (CL.preset) clLoadPreset(CL.preset);
  else clBuild();
};
PLAIN.cache = lb(
  'A cache is a small, fast memory that keeps copies of recently used data. When the processor asks for an address, the cache either has it (a hit, fast) or must fetch it from main memory (a miss, slow). Pick an experiment above and press <b>Next access</b>.'
);
QZ.cache = [
  'Two addresses keep evicting each other in a direct-mapped cache. What helps most?',
  ['A faster clock', 'More associativity (more ways per set)', 'Smaller blocks'],
  1,
  'They are conflict misses: with two or more ways, both blocks can live in the same set.',
];
