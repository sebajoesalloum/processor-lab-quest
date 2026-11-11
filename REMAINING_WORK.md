# Remaining work after Processor Lab 4.0

The 4.0 features (pipeline explanation, datapath walk-through, set-associative Cache Lab, professor demonstration) and the earlier 3.x work are implemented and tested. The items below are the remaining scope limits, not features that the project claims to have completed.

## Not yet implemented or independently verified

1. **Full ISA coverage.** The app supports a defined MIPS32/RV32I teaching subset. Every supported instruction is now cross-checked against GNU binutils 2.42 (`tools/crosscheck.mjs`: 24,004 words, 0 mismatches), but a second independent assembler (for example LLVM) has not been used, and full MIPS32/RV32I coverage (shifts, logical ops, jumps, byte/halfword memory access, M/C extensions) is not implemented. SUBLEQ has no standard encoding to check against.
2. **x86-64 machine-code encoding.** x86 instruction sizes remain estimates. Full variable-length encoding, prefixes, ModRM/SIB, and relocation handling are intentionally deferred.
3. **More realistic pipeline behavior.** The five-stage model is in-order and single-issue with EX/MEM and MEM/WB forwarding, load-use stalls, and a fixed branch penalty resolved in EX (every branch = stall, taken only = predict not-taken with flush). It covers RV32I and MIPS32 only. Branch resolution in ID, branch prediction, structural hazards, exceptions, multiple issue and cache-induced stalls are not modeled.
4. **Richer memory hierarchy.** Set associativity, LRU/FIFO/random replacement and write-back/write-through are implemented for a single data cache. Instruction caches, multi-level hierarchies, write buffers and write-back timing inside AMAT remain future extensions.
5. **Cross-browser verification.** The Chromium suite passes. Firefox and Safari were not available in this environment, so they are **unverified**. Tooling is ready: run `browser-selftest.html`, follow `CROSS_BROWSER_CHECKLIST.md`, and record the browser versions you used.
6. **Full accessibility audit.** Keyboard tab navigation, ARIA tab semantics, focus visibility, reduced-motion handling, and selected light/dark contrast pairs are tested. A complete WCAG audit with a screen reader and real assistive technology is still needed.
7. **Custom ISA generalization.** The current seven-opcode custom ISA builder remains intentionally constrained; arbitrary instruction formats and synthesized hardware are not supported.
8. **More workloads and broader input ranges.** Fibonacci (n = 0 to 15), array maximum, and matched unrolled/looped array sums are included. More signed, overflow, nested-loop, and branch-heavy workloads could expand coverage.
9. **Hardware measurement.** No identified physical implementation is attached, so area, transistor count, measured power, actual clock, cache latency, and manufacturing cost remain unavailable rather than estimated.

## Recommended next validation

- Run `npm run verify` after any source change.
- Run `python3 browser_e2e.py` where Playwright and Chromium are installed.
- Open the standalone HTML in Firefox and Safari, and test on the actual presentation device.
- Add any new instruction to `tools/crosscheck.mjs` and run it (`node tools/crosscheck.mjs`) before extending the instruction subset.
- Keep report wording explicit about the boundary between specification facts, trace counts, editable assumptions, and unavailable measurements.
