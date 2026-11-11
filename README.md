# Processor Lab 4.0 — offline processor teaching simulator

**Created by Student Seba Joe Salloum**

Processor Lab is a single-file, offline web application that runs four educational processor models (SUBLEQ, a MIPS32 subset, an RV32I subset and a small x86-64 subset) on the same twelve workloads, verifies every result, and explains where every number comes from. Version 4.0 keeps all 3.1 functionality and adds four teaching features plus a set of correctness fixes. The full audit, decisions and test report are in `UPGRADE_REPORT_4.0.md`.

## Open the application

Open `processor-lab.html` in a modern desktop browser (double-click it). No server, login, network connection or external library is needed. A **Professor demo** button in the header opens the presentation experiments directly.

For development, edit the modules under `src/` and rebuild the standalone file:

```sh
npm run build      # bundles src/*.js into processor-lab.html and browser-selftest.html
npm run verify     # build + all Node tests
python3 browser_e2e.py   # optional Chromium end-to-end suite (needs Python Playwright)
```

## What is new in 4.0

### 1. Interactive pipeline explanation (Execution Simulator → *Five-stage pipeline (explained)*)

- Step, play/pause, reset, jump to end, cycle slider, and clickable cycle numbers.
- For every cycle: what is in IF, ID, EX, MEM and WB, what each instruction is doing **with its real values** (for example `add t1,t0,t0 computes 7 + 7 = 14`), and which stages hold stalled instructions, bubbles or flushed slots.
- Data hazards: producer, consumer, register, distance, why the hazard exists, whether forwarding solves it, and why a load-use dependency still needs one stall.
- A forwarding diagram (ID/EX, EX/MEM, MEM/WB pipeline registers) that lights up the EX/MEM → EX or MEM/WB → EX path in use, with the forwarded value.
- Branch resolution in EX, taken/not taken, and the penalty slots (bubbles for "every branch", flushes for "taken only").
- Performance panel: cycles, completed instructions, stalls, CPI, execution time at a chosen clock, the cycle decomposition (instructions + 4 fill + stalls + penalties), and a forwarding on/off comparison.
- Programs: the selected workload, four built-in hazard demos, or your own RV32I/MIPS32 program.
- **Value-level verification:** the explanation model re-derives every source operand the pipeline would deliver (forwarded, or read from the register file in that cycle) and checks it against the interpreter. With forwarding on or off, every operand of every workload matches, and final registers are identical. A test injects a schedule that reads too early and confirms the check catches it.

### 2. Visual instruction execution and datapath (Execution Simulator → *Multicycle + datapath*)

- Each executed instruction is shown in six phases: fetch, decode, register read, ALU, memory, write-back/next PC. Step phase by phase or animate.
- Architecture-specific diagrams: the textbook **MIPS32** datapath (RegDst and MemtoReg multiplexers, sign-extender, PC+4-relative branch adder), the **RV32I** datapath (no RegDst, I/S/B/U immediate generator, PC-relative branch adder, ALUSrcA for `auipc`), a **SUBLEQ** execution model and an **x86** model explicitly labelled *Conceptual execution model*.
- Active components and wires are highlighted, wires carry real values (PC, register values, immediate, ALU inputs/result, address, memory data, written register, next PC), and the main control signals are listed for MIPS32/RV32I.
- Every value comes from the interpreter trace; the ALU result, address and branch decision are recomputed and cross-checked ("recomputed values match the interpreter").

### 3. Cache Lab (new tab; the simulator and Compare page use the same engine)

- Set-associative caches from direct-mapped to fully associative; LRU, FIFO or seeded (reproducible) random replacement; write-back or write-through; write-allocate or no-write-allocate.
- Step through any access sequence: the address split into tag / index / offset (binary), the selected set, the matching or filled line, HIT or MISS with the reason (compulsory, capacity or conflict), the victim and any dirty write-back, the full cache contents (valid and dirty bits, tag, block range, LRU/FIFO age), memory blocks, and the access history.
- Compare up to three configurations on the same sequence: hits, misses, hit/miss rate, the 3C breakdown, write-backs, memory writes and AMAT (with the formula shown), plus an automatic explanation of the differences.
- Six ready experiments: temporal locality, spatial locality and block size, conflict misses vs associativity, LRU vs FIFO, random access and capacity, write-back vs write-through. Sequences can also be generated, typed, or taken from a benchmark program's real data accesses.

### 4. Professor demonstration mode (new tab and header button)

Three ready-to-run experiments, each with a title, introduction, program, Run, step-by-step view, live statistics, results, explanation, Reset, JSON export and a return-to-simulator button:

1. **MIPS32 vs RV32I** on Fibonacci, array maximum or sum 1..N: both interpreters stepped in lock-step, instruction counts, multicycle and pipeline cycles and CPI, final registers, encoding differences with bit fields, and an explanation computed from the traces (for Fibonacci(7), MIPS32 needs 8 more instructions because it tests "less than" with `slt` + `beq` where RV32I uses one `bge`).
2. **Pipeline forwarding**: the same six instructions with forwarding off (18 cycles, 8 stalls) and on (12 cycles, 2 load-use stalls), both pipeline diagrams, and a per-dependency comparison.
3. **Cache performance**: one access sequence on a 64 B direct-mapped, a 64 B 2-way and a 128 B direct-mapped cache (interleaved arrays: 0, 28 and 28 hits out of 32; a second workload shows LRU doing worse on a scan larger than the cache).

### Improvements to existing features

- Every number is labelled **Simulated**, **Calculated**, **Assumption**, **Estimate** or **Not measured**; nothing is presented as a hardware measurement. x86 code size is marked as an estimate per cell.
- Compare & Reports adds five-stage pipeline cycles and CPI, the full cache configuration, and a cycle-cost preset switch between the lab defaults and the textbook multicycle values (load 5, store 4, ALU 4, branch 3).
- Benchmarks show cycles, CPI, execution time and pipeline cycles per model, with metric definitions.
- Instruction Explorer decodes each field: register numbers with names, signed immediates, branch offsets and targets.
- Custom ISA builder: format diagram, instruction-set table, per-instruction meaning, field-separated machine code, and clear errors for undefined labels, non-numeric operands and impossible formats.
- JSON/CSV/HTML reports include CPI, pipeline cycles and settings, and the cache configuration.

## Run the tests

Requires Node.js 18+:

```sh
npm run verify
```

This runs 102 Node tests from eight files, including `tests/v4.test.js` (hand-calculated pipeline schedules, forwarding paths and values, timeline occupancy, datapath values for arithmetic/register/load/store/branch/U-type/SUBLEQ/x86, cache address splitting, LRU vs FIFO traces, 3C classification, write policies, the three demo experiments, and mutation checks). The GNU binutils encoding cross-check runs when `mips-linux-gnu-as` and `riscv64-linux-gnu-as` are installed (otherwise it is skipped, not failed).

Recorded results: `test-results.txt` (102 Node tests, 0 failed, 0 skipped), `browser-results.txt` (147 Chromium browser checks), `crosscheck-results.txt` (24,004 words, 0 mismatches). `browser-selftest.html` runs 76 engine checks in any browser.

**Firefox and Safari have not been verified** (they could not be installed where this was built). Use `browser-selftest.html` and `CROSS_BROWSER_CHECKLIST.md` on the presentation machine. Edge uses the same Chromium engine that was tested. `node compat_scan.mjs` reports Firefox 85+ and Safari 15.4+ as the minimum versions.

## Important limits

- An educational interpreter and timing models, not a gate-level, cycle-accurate or commercial processor emulator.
- MIPS32 and RV32I are teaching subsets (`lw sw add(u) sub(u) addi(u) slt beq bne`, plus `blt bge lui auipc` for RV32I). x86-64 is a small subset with estimated code sizes and no machine-code encoding. SUBLEQ's looped array sum uses a declared indirect-address extension.
- The pipeline covers MIPS32 and RV32I only: in-order, single-issue, branches resolved in EX with a fixed editable penalty; no structural hazards, branch prediction or cache stalls. MIPS branch delay slots are abstracted.
- The datapath diagrams are textbook organisations; SUBLEQ and x86 are conceptual models.
- The cache models data accesses only (no instruction fetches, no multi-level hierarchy); AMAT uses the single-level formula, and write-back traffic is reported separately.
- Clock rate, cycle costs, power, labour hours, hit time and miss penalty are editable assumptions. No area, transistor count, measured power or chip cost is available or inferred.
- In this model instruction and data memories are separate. The RV32I `auipc` array-base example works because instruction 0 and data word 0 both sit at address 0; it illustrates the instruction, not a real memory map.

## Project files

- `assets/intro.mp4` — the intro video, embedded into the built file by `build.js`. Replace this file and run `npm run build` to change the intro.
- `processor-lab.html` — the built offline application. `processor-lab.template.html` — its HTML/CSS shell.
- `src/` — `util`, `engine`, `encoders`, `datapath` (instruction semantics and datapath layouts), `pipeline` (schedule + explanation model), `cache` (set-associative model, patterns), `demo` (experiment calculations), `custom-isa`, `reports`, `selftest`, and the UI modules `ui`, `ui-pipeline`, `ui-datapath`, `ui-cache`, `ui-demo`, `main`.
- `build.js`, `package.json` — build and test commands. `test.js`, `tests/` — Node tests and golden export files.
- `browser_e2e.py`, `browser-selftest.html`, `compat_scan.mjs`, `CROSS_BROWSER_CHECKLIST.md` — browser verification.
- `tools/crosscheck.mjs` — independent encoding check against GNU binutils.
- `screenshots/` — the four new features. `UPGRADE_REPORT_4.0.md` — audit, decisions, bug fixes, tests and evaluation.
- `CHANGELOG.md`, `REMAINING_WORK.md`, `NEXT_DEVELOPMENT_PROMPT.md`, `sample-results.json`.
