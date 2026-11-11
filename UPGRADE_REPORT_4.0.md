# Processor Lab 4.0 — upgrade report

**Project:** Processor Lab, created by Student Seba Joe Salloum
**Input:** `Processor_Lab_3_1_Upgraded_v2.zip` (version 3.1)
**Output:** version 4.0, same single-file offline architecture, no new dependencies
**Date:** 9 November 2026

This report covers the deliverables requested in the master development prompt: audit and decisions, bug fixes, improvements, the four new features, testing with counts, remaining limitations, run instructions, a before/after comparison and an evaluation.

---

## 1. Audit (Phase A)

### Architecture found

- `src/engine.js`: assemblers and interpreters for SUBLEQ, MIPS32 subset, RV32I subset and x86-64 subset; 12 workloads; trace recording; step/step-back.
- `src/encoders.js`: MIPS32/RV32I machine-code encoders with field diagrams (already cross-checked against GNU binutils in 3.1).
- `src/pipeline.js`: five-stage timing model driven by the interpreter trace.
- `src/cache.js`: direct-mapped, write-allocate data cache.
- `src/custom-isa.js`, `src/reports.js`, `src/selftest.js`, `src/ui.js` (all views in one file), `build.js` bundling everything into `processor-lab.html`.
- Tests: 81 Node tests (2 skipped because the GNU cross-assemblers were missing) and a 90-check Chromium suite. Both passed on the original.

### Decisions for every existing feature

| Feature | Decision | Reason |
|---|---|---|
| SUBLEQ, MIPS32, RV32I, x86-64 interpreters | **KEEP** | Re-verified: all 12 workloads correct on all 4 models; randomized differential tests (about 2,800 runs) pass; every executed instruction of every workload now also cross-checked by the independent datapath recomputation. No defect found. |
| MIPS32/RV32I encoders | **KEEP** | GNU binutils 2.42 cross-check re-run here: 24,004 words, 0 mismatches. |
| Multicycle timing (default) | **KEEP + IMPROVE** | Kept as default with the same cost values so earlier results are reproducible. Its lab-default costs (load 2, store 2, ALU 1, branch 1) are not the textbook multicycle figures, while the old UI listed 4–5 phases per class; this mismatch is now explained, costs are labelled, and a one-click *Textbook multicycle* preset (5/4/4/3) is added. |
| Five-stage pipeline model | **KEEP (engine) + IMPROVE (view)** | Hand calculations below agree with the model. Its view is upgraded into the explanation mode rather than duplicated. |
| Pipeline panel (3.x) | **REPLACE** | Now the interactive explanation component; it also follows the selected model instead of a separate ISA selector. |
| Generic datapath diagram (3.x) | **REPLACE** | Same diagram for all four ISAs (misleading for SUBLEQ and x86), no values, and it showed a write-back for stores. Replaced by architecture-specific datapaths with values. |
| Direct-mapped cache | **IMPROVE** | Generalised to set-associative with replacement and write policies; the 3.x function remains as a wrapper and still returns identical results (tested). |
| Cache card in simulator and Compare | **IMPROVE** | Uses the new engine; links to the Cache Lab instead of duplicating it. |
| Benchmarks | **IMPROVE** | Added cycles, CPI, time, pipeline cycles and metric definitions. Workload equivalence and outputs re-verified. |
| Compare & Reports | **IMPROVE** | Value classes corrected (see bug B6), pipeline columns, cache configuration, cost presets. |
| Instruction Explorer encodings | **IMPROVE** | Decoded field meanings (register names, signed immediates, branch targets). |
| Custom ISA builder | **IMPROVE** | Validation, format diagram, instruction-set table, per-instruction meaning. Functionality preserved. |
| JSON/CSV/HTML exports | **IMPROVE** | CPI, pipeline cycles/settings, cache configuration, estimate flags. Golden files updated deliberately. |
| Breakpoint, Play/Pause | **FIX** | Bug B1. |
| OISC lesson, Processor Models, Sandbox, quizzes, glossary, levels, intro, presenter mode | **KEEP** | Working. Presenter mode gains a sixth step for the demonstration. |
| `alert()` dialogs | **REMOVE** | Blocking dialogs break presentations and automated browsers; replaced with inline messages. |
| Old datapath helper code (`SG`, `DPINFO`, `dpExplain`, old `datapath()`) | **REMOVE** | Superseded by the new datapath module. |

Nothing else was removed. All four processors, the multicycle default, the five-stage pipeline, the custom ISA builder, the cache simulator, the benchmarks and every export remain.

---

## 2. Bug-fix report (Phase B)

| # | Bug | Effect | Fix | Test |
|---|---|---|---|---|
| B1 | Play while stopped at a breakpoint re-checked the breakpoint before stepping | Execution could never continue past a breakpoint | First tick after Play always executes | Browser: "Play resumes past a breakpoint" |
| B2 | Generic datapath highlighted write-back for `sw` | Taught that stores write a register | New datapath: stores show RegWrite = 0 and no write-back | `tests/v4.test.js` datapath store check; browser store check |
| B3 | Pipeline panel used its own ISA selector, ignoring the selected MIPS32/RV32I model | Panel could show a different ISA than the one selected | Follows the selected model; explains when SUBLEQ/x86 is selected | Browser: "pipeline states it does not model x86" |
| B4 | `alert()` for invalid cache values and breakpoints | Blocks the page | Inline messages / field validity | Browser: "invalid breakpoint reported inline" |
| B5 | `dl()` wrote to `#dm`, which exists only on Compare | JavaScript error when exporting from other pages | Guarded | Browser: "browser JavaScript errors: []" |
| B6 | Cycles, CPI, time, AMAT labelled "Assumption"; energy and labour labelled the same as inputs; x86 code size labelled "Trace" | Blurred simulated, calculated and estimated values | New labels: Simulated / Calculated / Assumption / Estimate / Not measured; x86 size marked estimate per cell | Browser contrast + content checks |
| B7 | Custom ISA: undefined `JNZ` label and non-numeric operands reported as "outside N-bit range"; formats with no immediate room accepted by the API | Misleading errors | Specific messages; `customFormat()` validates | `tests/v4.test.js` custom ISA test |
| B8 | `UPGRADE_SUMMARY.md` still said FIB returns 1 for n = 0 | Documentation contradicted the 3.1 fix | Corrected (F(0) = 0 on all models, tested by `tests/fib_edge.test.js`) | `tests/fib_edge.test.js` |
| B9 | Pipeline view of a 1,500-instruction program took 23.5 s (quadratic timeline, 2.2 million table cells) | UI freeze on larger programs | Linear-time timeline, 48-cycle diagram window, capped hazard list: 0.2 s | Stress test (section 7) |
| B10 | Engine run cache grew without bound with custom inputs | Slow memory growth | Bounded to 400 entries | Stress test: heap flat over 60 repeated runs |

### Correctness validation with independent hand calculations

**Pipeline, forwarding on** — `lw t0; add t1,t0,t0; sub t2,t1,t0; lw t3; add t4,t3,t2; sw t4` (memory 7, 5):
lw EX3 MEM4 WB5 → add needs t0 after MEM4 → EX5 (1 stall, MEM/WB → EX, value 7) → sub EX6 (t1 by EX/MEM → EX, value 14) → lw EX7 MEM8 → add EX9 (1 stall, MEM/WB, value 5) → sw EX10, WB12. **12 cycles, 2 stalls, CPI 2.0.** The model returns the same EX cycles `[3,5,6,7,9,10]`.

**Same program, forwarding off** — each consumer reads the register file in its last ID cycle, which must be ≥ the producer's WB (write first half, read second half): EX cycles `[3,6,9,10,13,16]`, **18 cycles, 8 stalls, CPI 3.0**. Model agrees.

**Ideal pipeline** — 5 independent instructions = 5 + 4 = **9 cycles** (CPI 1.8); at 200 MHz 45 ns. Model agrees.

**Cycle identity** checked for every workload × ISA × forwarding × policy × penalty: cycles = N + 4 + data stalls + branch-penalty cycles (minus a trailing branch's penalty).

**Cache, LRU vs FIFO** — 64 B, 16 B blocks, 2-way (2 sets); addresses 0 32 0 64 0 32 0 64 0 32 0 64 all map to set 0 (blocks 0, 2, 4). Traced by hand: LRU hits at accesses 3, 5, 7, 9, 11 (**5 hits**, AMAT = 1 + 7/12 × 20 = 12.67); FIFO hits at 3, 7, 11 (**3 hits**, AMAT = 16). Model agrees access by access.

**Address split** — 0x1234 in the same cache: block 291, index 1, tag 145, offset 4. Model agrees.

**Write policies** — `w0 w4 w8 w12` ×3 then `r64 r80` in a 32 B cache: 11 hits, 3 misses; write-back: 1 write-back (dirty block 0 evicted by 64), 0 write-through writes; write-through: 12 memory writes, 0 write-backs. Model agrees.

**3C** — alternating 0/64 in 64 B direct-mapped: 2 compulsory + 14 conflict, 0 hits; fully associative: 14 hits. 96-byte array twice through 64 B direct-mapped: 6 compulsory + 4 capacity. Model agrees.

**ISA comparison** — Fibonacci(7): the loop test runs n + 1 = 8 times; MIPS32 needs `slt` + `beq` where RV32I uses `bge`, so MIPS32 executes exactly 8 more instructions (56 vs 48). Model agrees.

---

## 3. New features (Phase C)

### Feature 1 — Interactive pipeline explanation
Implemented in the existing pipeline mode (`src/pipeline.js` `explainPipeline`, `src/ui-pipeline.js`). Per cycle: occupancy of all five stages, real values, stalled/held/bubble/flushed slots; hazards with producer, consumer, register, distance, cause and resolution; forwarding diagram with the active path and value; load-use explanation; branch resolution and penalty; performance with time at a clock and the forwarding on/off comparison. Step, back, play/pause, reset, end, slider and clickable cycles. Programs: workloads, four hazard demos, or custom code.
**Acceptance:** the same dependent sequence with forwarding on/off gives identical final registers, the expected forwarding paths and stalls, and hand-checked cycle counts; additionally every delivered operand is verified against the interpreter (all workloads, both ISAs, both policies, penalties 0/2/3).

### Feature 2 — Visual instruction execution and datapath
`src/datapath.js` (`describeInstruction`, `datapathPhases`, layouts) and `src/ui-datapath.js`. Six phases with highlighted components and labelled wires; register, ALU, memory, write-back and next-PC values; control signals. MIPS32 and RV32I show their different textbook datapaths; SUBLEQ and x86 are labelled conceptual models.
**Acceptance:** tested for an arithmetic immediate (`addi`), a register-register add, a load, a store, a taken and a not-taken branch, `lui`/`auipc`, SUBLEQ and an x86 memory-operand add; plus every executed instruction of every workload on all four models cross-checks against the interpreter.

### Feature 3 — Advanced cache visualisation
`src/cache.js` (`simulateCache`, patterns, parser) and `src/ui-cache.js` (Cache Lab tab, reusable viewer). Structure, sets, lines, tags, valid/dirty bits, memory blocks, replacement, history, tag/index/offset bits, HIT/MISS with 3C reason, live statistics, up to three configurations with AMAT and explanations, six experiments covering temporal, spatial, sequential, repeated, random and conflict behaviour.
**Acceptance:** identical sequences under different configurations checked by hand (section 2); statistics consistency (hits + misses = accesses, 3C sum = misses) checked for every workload trace × 3 associativities × 3 policies.

### Feature 4 — Professor demonstration mode
`src/demo.js` (pure, tested) and `src/ui-demo.js`. Three experiments with title, introduction, program, Run, step-by-step view, live statistics, results, explanation, Reset, JSON export and return to the simulator. Header button for one-click access during a presentation.
**Acceptance:** all three run, rerun and reset in the browser suite; results are reproducible (tested twice in a row); the export reflects the run.

---

## 4. Improvements to existing features (Phase D)

Comparison labelling and pipeline/cache columns; benchmark metrics and definitions; decoded encoding fields; custom ISA validation and explanations; report and export content; header demo button; phone-width layout (no horizontal page scroll at 390 px on any page, including all three experiments); WCAG AA contrast measured for the new badges and pipeline stage colours in light and dark themes; keyboard-operable controls throughout; timers stopped on navigation.

---

## 5. Test report (Phase E)

| Suite | Result |
|---|---|
| Node (`npm run verify`) | **102 Node tests: 102 passed, 0 failed, 0 skipped** (`test-results.txt`). The two GNU cross-check tests ran because the assemblers were installed here. |
| GNU binutils cross-check (`node tools/crosscheck.mjs`) | 107 programs, 24,004 words, **0 mismatches** (`crosscheck-results.txt`) |
| Chromium end-to-end (`python3 browser_e2e.py`) | **147 Chromium checks: 147 passed, 0 failed, 0 skipped**, no JavaScript errors (`browser-results.txt`) |
| In-browser self-test (`browser-selftest.html`, Chromium) | 76 of 76 passed |
| Mutation testing | 9 deliberately injected bugs (removed load-use stall, forwarding a load from EX/MEM, LRU evicting the newest line, swapped 3C classes, write miss not dirty, index computed from lines instead of sets, swapped ALU subtraction, unshifted U-type immediate, register file read one cycle early): **9 of 9 caught** (two only after adding the tests they exposed as missing) |
| Stress | 60 repeated full cycles through pipeline, Cache Lab and all three experiments: JS heap 2.4 → 3.9 MB after 10 rounds → 4.2 MB after 60 (no growth trend), no errors. 1,500-instruction program in pipeline view: 0.2 s |
| Firefox, Safari | **Not run** (browsers could not be downloaded in this environment). Edge uses the same Chromium engine. Static scan: Firefox 85+ and Safari 15.4+ required. |

New tests in 4.0: `tests/v4.test.js` (21 tests), 6 self-test checks, 57 browser checks (datapath on all four ISAs, pipeline explanation, breakpoint resume, Cache Lab, all three demo experiments with export and rerun, responsive layout of the new pages at 390/768/1366 px, contrast of new components in both themes).

---

## 6. Remaining limitations

- Firefox and Safari are unverified; run `browser-selftest.html` and `CROSS_BROWSER_CHECKLIST.md` on the presentation machine. No screen-reader audit has been done.
- ISA coverage is a teaching subset (listed in the README). x86 has no machine-code encoder; its sizes are estimates.
- Pipeline: MIPS32/RV32I only; branches resolve in EX with a fixed penalty; no prediction, structural hazards, exceptions or cache stalls; MIPS delay slots abstracted.
- Datapaths are textbook organisations, not gate-level models; SUBLEQ and x86 are conceptual.
- Cache: single-level data cache; AMAT excludes write-back traffic (reported separately); no instruction cache.
- Cycle costs, clock, power, hours, hit time and miss penalty are assumptions. Nothing is measured on hardware.

---

## 7. How to run

1. Unzip and double-click `processor-lab.html` (Chrome, Edge or another Chromium browser; check Firefox/Safari first with `browser-selftest.html`).
2. For a presentation: click **Professor demo** in the header, choose an experiment, press **Run experiment**, then **Step**.
3. Developers: `npm run verify` (Node 18+); optional `python3 browser_e2e.py` (Python Playwright); optional `node tools/crosscheck.mjs` (needs `binutils-mips-linux-gnu` and `binutils-riscv64-linux-gnu`).

---

## 8. Original versus upgraded

| Area | 3.1 | 4.0 |
|---|---|---|
| Pipeline | Static cycle grid, totals | Cycle-by-cycle explanation, hazards, forwarding diagram with values, flush/bubble causes, on/off comparison, per-operand verification, custom programs |
| Datapath | One generic diagram, block highlight only (wrong for stores) | Separate MIPS32/RV32I/SUBLEQ/x86 diagrams, six phases, real values on wires, control signals, cross-check |
| Cache | Direct-mapped, totals only | Set-associative, LRU/FIFO/random, write-back/through, allocation options, 3C, step-by-step lab, 3-way comparison |
| Demonstration | Presenter notes over existing pages | Three dedicated, steppable, resettable, exportable experiments |
| Value labelling | ISA fact / Trace / Assumption / Unavailable | ISA fact / Simulated / Calculated / Assumption / Estimate / Not measured |
| Multicycle costs | Fixed lab defaults | Same defaults + textbook preset, explained |
| Exports | No CPI in JSON, no pipeline data | CPI, pipeline cycles and settings, cache configuration, estimate flags; per-experiment JSON |
| Tests | 81 Node (2 skipped), 90 browser | 102 Node (0 skipped), 147 browser, 76 self-test, 9/9 mutations |
| Large programs | Pipeline view quadratic | Linear, windowed |

---

## 9. Evaluation

**9 / 10.** Every requested feature is implemented inside the existing design, every displayed number comes from the simulators and is checked against hand calculations or the interpreter, and the test suites pass with mutation evidence that they detect real bugs. The missing point is verification rather than functionality: Firefox and Safari have not been tested and no screen-reader audit has been done. Running the cross-browser checklist on the presentation laptop is the remaining step that would justify 10/10.
