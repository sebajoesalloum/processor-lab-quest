/* Data-cache models.
   simulateCache: set-associative cache (direct-mapped = 1 way, fully associative = lines ways)
   with LRU / FIFO / seeded-random replacement, write-back or write-through, and
   write-allocate or no-write-allocate. Every access records its tag/index/offset
   split, the set it maps to, the way it hit or filled, any victim, and a copy of
   the set afterwards, so the visualiser only ever shows simulated state.
   simulateDirectMappedCache keeps the 3.x API (direct-mapped, write-allocate). */

const pow2 = (n) => Number.isInteger(n) && n > 0 && (n & (n - 1)) === 0;
const log2 = (n) => Math.round(Math.log2(n));
export const CACHE_POLICIES = ['LRU', 'FIFO', 'RANDOM'];
export const WRITE_POLICIES = ['write-back', 'write-through'];

/* Small deterministic PRNG so "random" replacement is reproducible (same seed, same victims). */
export function lcg(seed) {
  let s = seed >>> 0 || 1;
  return () => {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

export function cacheGeometry(options = {}) {
  const cacheSize = Number(options.cacheSize ?? 64),
    blockSize = Number(options.blockSize ?? 16),
    lines = cacheSize / blockSize;
  let associativity = options.associativity ?? 1;
  if (associativity === 'full') associativity = lines;
  associativity = Number(associativity);
  if (!pow2(cacheSize) || !pow2(blockSize) || blockSize > cacheSize)
    throw new Error('Cache and block sizes must be powers of two, and block size cannot exceed cache size.');
  if (blockSize < 4) throw new Error('Block size must be at least one 4-byte word.');
  if (!pow2(associativity) || associativity > lines)
    throw new Error(
      'Associativity must be a power of two from 1 to ' + lines + ' (the number of lines in this cache).'
    );
  const sets = lines / associativity,
    offsetBits = log2(blockSize),
    indexBits = log2(sets),
    addressBits = Number(options.addressBits ?? 16);
  if (!Number.isInteger(addressBits) || addressBits < offsetBits + indexBits || addressBits > 32)
    throw new Error('Address width is too small for this cache geometry.');
  return {
    cacheSize,
    blockSize,
    lines,
    associativity,
    sets,
    offsetBits,
    indexBits,
    tagBits: addressBits - offsetBits - indexBits,
    addressBits,
  };
}

/* Split an address the way the hardware does: | tag | index | offset |. */
export function splitAddress(address, g) {
  const block = Math.floor(address / g.blockSize);
  return {
    address,
    block,
    offset: address % g.blockSize,
    index: block % g.sets,
    tag: Math.floor(block / g.sets),
  };
}

export function simulateCache(accesses, options = {}) {
  const g = cacheGeometry(options);
  const hitTime = Number(options.hitTime ?? 1),
    missPenalty = Number(options.missPenalty ?? 20);
  if (!Number.isFinite(hitTime) || hitTime < 0 || !Number.isFinite(missPenalty) || missPenalty < 0)
    throw new Error('Cache timing values must be non-negative.');
  const policy = String(options.policy ?? 'LRU').toUpperCase();
  if (!CACHE_POLICIES.includes(policy))
    throw new Error('Replacement policy must be LRU, FIFO or RANDOM, not "' + options.policy + '".');
  const writePolicy = options.writePolicy ?? 'write-back';
  if (!WRITE_POLICIES.includes(writePolicy))
    throw new Error('Write policy must be write-back or write-through.');
  const writeAllocate = options.writeAllocate !== false;
  const rand = lcg(options.seed ?? 12345);
  /* each line: {valid, dirty, tag, block, lastUse, filledAt} */
  const sets = Array.from({ length: g.sets }, () =>
    Array.from({ length: g.associativity }, () => ({
      valid: false,
      dirty: false,
      tag: null,
      block: null,
      lastUse: -1,
      filledAt: -1,
    }))
  );
  /* fully associative LRU shadow of the same capacity: separates capacity from conflict misses (3C model) */
  const shadow = [],
    seenBlocks = new Set();
  let hits = 0,
    misses = 0,
    reads = 0,
    writes = 0,
    writebacks = 0,
    memoryWrites = 0,
    compulsory = 0,
    capacity = 0,
    conflict = 0,
    t = 0;
  const trace = [];
  for (const a of accesses || []) {
    const address = Number(typeof a === 'number' ? a : a.address);
    if (!Number.isFinite(address) || address < 0 || !Number.isInteger(address))
      throw new Error('Invalid memory address ' + (typeof a === 'number' ? a : a?.address));
    if (address >= 2 ** g.addressBits)
      throw new Error('Address ' + address + ' does not fit in ' + g.addressBits + ' address bits.');
    const type = (typeof a === 'object' && a.type) || 'read';
    const isWrite = type === 'write';
    if (isWrite) writes++;
    else reads++;
    const parts = splitAddress(address, g),
      set = sets[parts.index];
    let way = set.findIndex((l) => l.valid && l.tag === parts.tag);
    const hit = way >= 0;
    /* 3C classification uses the shadow fully associative LRU cache */
    const shadowPos = shadow.indexOf(parts.block);
    const shadowHit = shadowPos >= 0;
    if (shadowHit) shadow.splice(shadowPos, 1);
    shadow.unshift(parts.block);
    if (shadow.length > g.lines) shadow.pop();
    let missKind = null,
      victim = null,
      action;
    if (hit) {
      hits++;
      const line = set[way];
      line.lastUse = t;
      if (isWrite) {
        if (writePolicy === 'write-back') {
          line.dirty = true;
          action = 'Write hit: data updated in the cache line and the line is marked dirty (memory updated later).';
        } else {
          memoryWrites++;
          action = 'Write hit: cache line and main memory are both updated (write-through).';
        }
      } else action = 'Read hit: data returned from the cache.';
    } else {
      misses++;
      if (!seenBlocks.has(parts.block)) {
        missKind = 'compulsory';
        compulsory++;
      } else if (!shadowHit) {
        missKind = 'capacity';
        capacity++;
      } else {
        missKind = 'conflict';
        conflict++;
      }
      const allocate = !isWrite || writeAllocate;
      if (allocate) {
        way = set.findIndex((l) => !l.valid);
        if (way < 0) {
          if (policy === 'LRU') way = set.reduce((best, l, i) => (l.lastUse < set[best].lastUse ? i : best), 0);
          else if (policy === 'FIFO')
            way = set.reduce((best, l, i) => (l.filledAt < set[best].filledAt ? i : best), 0);
          else way = Math.floor(rand() * g.associativity);
          const old = set[way];
          victim = { way, tag: old.tag, block: old.block, dirty: old.dirty, writeback: old.dirty };
          if (old.dirty) writebacks++;
        }
        const line = set[way];
        line.valid = true;
        line.tag = parts.tag;
        line.block = parts.block;
        line.lastUse = t;
        line.filledAt = t;
        line.dirty = isWrite && writePolicy === 'write-back';
        if (isWrite && writePolicy === 'write-through') memoryWrites++;
        action =
          (isWrite ? 'Write miss: ' : 'Read miss: ') +
          'block ' +
          parts.block +
          ' loaded into set ' +
          parts.index +
          ', way ' +
          way +
          (victim
            ? ' after evicting block ' + victim.block + ' (' + policy + ')' + (victim.writeback ? ', which was dirty and is written back first' : '')
            : ' (an empty line was available)') +
          '.' +
          (isWrite ? (writePolicy === 'write-back' ? ' Line marked dirty.' : ' Memory also updated (write-through).') : '');
      } else {
        way = -1;
        memoryWrites++;
        action = 'Write miss with no-write-allocate: memory is updated directly and the cache is unchanged.';
      }
    }
    seenBlocks.add(parts.block);
    trace.push({
      step: t,
      ...parts,
      type,
      hit,
      way,
      missKind,
      victim,
      action,
      setAfter: set.map((l) => ({ ...l })),
    });
    t++;
  }
  const total = hits + misses,
    missRate = total ? misses / total : 0;
  return {
    ...g,
    policy,
    writePolicy,
    writeAllocate,
    hitTime,
    missPenalty,
    hits,
    misses,
    accesses: total,
    reads,
    writes,
    missRate,
    hitRate: total ? hits / total : 0,
    /* AMAT = hit time + miss rate x miss penalty (the standard single-level definition).
       Write-back traffic is reported separately, not folded into AMAT. */
    amat: hitTime + missRate * missPenalty,
    writebacks,
    memoryWrites,
    missBreakdown: { compulsory, capacity, conflict },
    finalSets: sets.map((s) => s.map((l) => ({ ...l }))),
    trace,
  };
}

/* 3.x API: direct-mapped, write-allocate. Kept so existing callers and tests are unchanged. */
export function simulateDirectMappedCache(accesses, options = {}) {
  const cacheSize = Number(options.cacheSize ?? 64),
    blockSize = Number(options.blockSize ?? 16);
  if (!pow2(cacheSize) || !pow2(blockSize) || blockSize > cacheSize || cacheSize % blockSize)
    throw new Error('Cache and block sizes must be powers of two, and block size cannot exceed cache size.');
  const clean = [];
  for (const a of accesses || []) {
    const address = Number(typeof a === 'number' ? a : a.address);
    if (!Number.isFinite(address) || address < 0) continue;
    clean.push({ address, type: (typeof a === 'object' && a.type) || 'read' });
  }
  const r = simulateCache(clean, {
    ...options,
    associativity: 1,
    policy: 'LRU',
    writePolicy: 'write-back',
    writeAllocate: true,
    addressBits: 32,
  });
  return {
    hits: r.hits,
    misses: r.misses,
    accesses: r.accesses,
    missRate: r.missRate,
    hitRate: r.hitRate,
    amat: r.amat,
    cacheSize: r.cacheSize,
    blockSize: r.blockSize,
    lines: r.lines,
    hitTime: r.hitTime,
    missPenalty: r.missPenalty,
    trace: r.trace.map((x) => ({
      address: x.address,
      type: x.type,
      block: x.block,
      index: x.index,
      tag: x.tag,
      hit: x.hit,
    })),
  };
}

/* Reproducible address-pattern generators for cache experiments (byte addresses, word aligned). */
export const CACHE_PATTERNS = {
  sequential: 'Sequential: walk an array once, word by word (spatial locality)',
  repeated: 'Repeated loop: walk a small array several times (temporal + spatial locality)',
  strided: 'Strided: touch one word per block (spatial locality wasted)',
  conflict: 'Conflict: alternate between two addresses that share a set',
  random: 'Random: seeded pseudo-random words in a region (little locality)',
  matrix: 'Column walk: read a 4×4 word matrix column by column',
};
export function cachePattern(kind, opts = {}) {
  const words = Math.max(1, Math.min(256, Number(opts.words ?? 16))),
    passes = Math.max(1, Math.min(8, Number(opts.passes ?? 3))),
    base = Number(opts.base ?? 0),
    stride = Number(opts.stride ?? 16),
    out = [];
  const rd = (address) => out.push({ address, type: 'read' });
  switch (kind) {
    case 'sequential':
      for (let i = 0; i < words; i++) rd(base + 4 * i);
      break;
    case 'repeated':
      for (let p = 0; p < passes; p++) for (let i = 0; i < words; i++) rd(base + 4 * i);
      break;
    case 'strided':
      for (let p = 0; p < passes; p++) for (let i = 0; i < words; i++) rd(base + stride * i);
      break;
    case 'conflict': {
      const span = Number(opts.span ?? 64);
      for (let i = 0; i < words; i++) rd(base + (i % 2 ? span : 0));
      break;
    }
    case 'random': {
      const r = lcg(opts.seed ?? 7),
        region = Math.max(1, Number(opts.region ?? 64));
      for (let i = 0; i < words; i++) rd(base + 4 * Math.floor(r() * region));
      break;
    }
    case 'matrix':
      for (let p = 0; p < passes; p++)
        for (let c = 0; c < 4; c++) for (let r = 0; r < 4; r++) rd(base + 4 * (r * 4 + c));
      break;
    default:
      throw new Error('Unknown cache pattern "' + kind + '".');
  }
  return out;
}

/* Parse a user-typed access list: "0, 4, w8, r12, 0x40" (w = write, r or nothing = read). */
export function parseAccessList(text) {
  const out = [];
  for (const raw of String(text).split(/[\s,;]+/)) {
    if (!raw) continue;
    const m = raw.match(/^([rwRW]?)(0x[0-9a-fA-F]+|\d+)$/);
    if (!m) throw new Error('Cannot read access "' + raw + '". Use numbers such as 0, 4, w8 or 0x40.');
    const address = Number(m[2]);
    if (address > 65535) throw new Error('Address ' + raw + ' is above 65535 (16-bit address space).');
    out.push({ address, type: m[1].toLowerCase() === 'w' ? 'write' : 'read' });
  }
  if (!out.length) throw new Error('Enter at least one address.');
  if (out.length > 1000) throw new Error('At most 1000 accesses.');
  return out;
}
