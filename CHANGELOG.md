# Processor Lab change log

## 4.0 — pipeline explanation, datapath, cache lab, professor demonstration (2026-11-09)

### Changed

- **New intro video.** The animated SVG "processor assembling" intro was replaced by an introduction video (`assets/intro.mp4`, ~50 s). `build.js` embeds it as base64, so `processor-lab.html` is still a single offline file (about 11 MB). Controls: Pause/Play, Replay, Sound on/Mute, Skip; the dashboard opens when the video ends. If the browser blocks autoplay with sound, the video starts muted with a hint. With reduced-motion enabled the intro is skipped. The "Replay" buttons in the Overview and Processor construction tabs replay the video.

### Fixed

- **Breakpoint could not be resumed.** Pressing Play while stopped at a breakpoint stopped again immediately, so execution could never continue past it. The first step after Play now always executes.
- **Datapath showed a write-back for stores.** The 3.x datapath highlighted the write-back block for `sw`; stores have no register write-back. Replaced by the architecture-specific datapath.
- **Pipeline panel ignored the selected model.** It used its own ISA selector even when MIPS32 or RV32I was chosen above it; it now follows the selected model and says so when SUBLEQ or x86 is selected.
- **Validation used blocking `alert()` dialogs** (cache values, breakpoint). Replaced with inline messages and field validity hints.
- **Downloading from a page without the report box threw an error** (`#dm` missing). Guarded.
- **Custom ISA:** an undefined `JNZ` label was reported as "immediate outside range", a non-number operand gave the same message, and instruction formats with no room for an immediate were not rejected. Each now has a clear message.
- **Labels:** cycles, CPI, time and AMAT were labelled "Assumption"; they are calculated values. Energy and labour cost are now "Estimate"; x86 code size is marked as an estimate per cell.
- **Docs:** `UPGRADE_SUMMARY.md` still claimed FIB returns 1 for n = 0 (fixed in 3.1). Corrected.
- **Performance:** a 1,500-instruction program took 23.5 s in pipeline view; the timeline is now built in linear time and the diagram is windowed (0.2 s).
- The run cache in the engine is bounded (no unbounded growth with many custom inputs).

### Added

- Interactive pipeline explanation mode with value-level operand verification against the interpreter (`explainPipeline`).
- Architecture-specific datapath walk-through with six phases and real values (`src/datapath.js`).
- Set-associative cache model (LRU/FIFO/seeded random, write-back/write-through, write-allocate options, 3C classification, write-backs) and the Cache Lab tab; the 3.x direct-mapped API is kept as a wrapper.
- Professor demonstration mode with three reproducible experiments and JSON export (`src/demo.js`, `src/ui-demo.js`).
- Pipeline cycles/CPI in Compare, Benchmarks and all exports; textbook multicycle cost preset; decoded instruction fields.
- The engine trace records each memory access value and memory before/after each step.
- `tests/v4.test.js` (21 tests), 6 new browser self-test checks, 57 new Chromium checks; mutation testing of 9 injected bugs.

### Validation

- 102 Node tests pass (0 skipped: the GNU binutils cross-check ran, 24,004 words, 0 mismatches).
- 147 Chromium browser checks pass (Chromium 153), no JavaScript errors.
- `browser-selftest.html`: 76 of 76 checks pass in Chromium. Firefox and Safari were not available and remain unverified.

## 3.1 — test restoration, strict pipeline decoder, branch policy, cross-browser tooling (2026-11-08)

### Fixed

- The pipeline decoder no longer treats unknown instructions as "no dependencies". It now has per-ISA opcode tables (MIPS32: `lw sw addu subu addiu slt beq bne`; RV32I adds `add sub addi blt bge lui auipc`), checks operand counts, and throws a descriptive error for anything else, including unsupported ISAs. The UI shows the error instead of fabricated cycle counts.
- Writing or reading the zero register (`x0`/`$zero`) no longer creates a RAW hazard.
- Replaced `Object.hasOwn()` with a portable helper so older Safari/Firefox versions do not crash.
- Documentation counts disagreed (80 vs 85 browser checks). The docs now quote the recorded result files and a test enforces it.

### Added

- **Branch penalty policy** in the pipeline panel and `simulatePipeline`: `every` (default, unchanged) or `taken`. Taken/not-taken comes from the interpreter's own trace via `traceToPipelineInput`. New chips show executed and taken branch counts.
- Restored the 2.1 regression and randomized tests that 3.0 had dropped (x86 flags, assembler rejection, RV32I aliases and immediate ranges, encoding vectors, custom ISA behavior, HTML escaping, stale-cache guard, step back), now importing modules directly. Randomized differential tests now cover ten workload families including `ARR_LOOP`, `MAXARR` and `FIB` (about 2,800 executions).
- New tests for the strict decoder, decoder/assembler drift, hand-calculated branch-policy schedules, the zero register, and documentation consistency.
- Mutation checks: six deliberately injected bugs (x86 `DEC` carry, `subu`, `beq`, custom-ISA wraparound, silent decoder acceptance, ignored branch policy) are all caught. One initially survived (custom-ISA immediate wraparound) and now has tests.
- Extracted `src/custom-isa.js` and `src/util.js` from `ui.js` so that code is testable without a DOM.
- `browser-selftest.html` (built from `src/selftest.js`), `compat_scan.mjs`, `CROSS_BROWSER_CHECKLIST.md`, and `browser_e2e.py --browser chromium|firefox|webkit`.
- Five new browser checks (policy default, taken-only effect, branch counts, error card, recovery).

### Follow-up changes (same release)

- Cross-check against GNU binutils 2.42 for MIPS32 and RV32I (`tools/crosscheck.mjs`, `tests/crosscheck.test.js`, `crosscheck-results.txt`): 107 programs, 24,004 words, 0 mismatches. Two injected encoder bugs (MIPS `slt` funct, swapped RV32I branch operands) are caught.
- Fixed: the RV32I assembler rejected a branch of exactly -4096 bytes (a legal B-type offset). Found by the cross-check.
- Fixed: Fibonacci returned 1 for n = 0 on every model. Loops now run n times and return the first register; input range is 0 to 15; added `tests/fib_edge.test.js` (fails against the old programs).
- Source formatted with Prettier; no behaviour change.

### Validation

- `npm run verify` (3.1): 81 tests passed under Node.
- `python3 browser_e2e.py` (3.1): 90 browser checks passed in Chromium 153, no JavaScript errors.
- `browser-selftest.html` passes 70 of 70 checks in Chromium.
- Firefox and Safari: **not verified** (not available in the build environment, and downloads were blocked). Use `CROSS_BROWSER_CHECKLIST.md`.

## 3.0 — pipeline, cache, RV32I, benchmark, and architecture upgrades (2026-11-08)

### Added

- Selectable five-stage IF/ID/EX/MEM/WB pipeline timing view; the original multicycle model remains the default.
- Cycle-by-cycle instruction overlap, forwarding on/off, RAW dependency stalls, load-use bubbles, configurable branch penalty, CPI, and trace-derived dynamic instruction schedules.
- Direct-mapped data-cache model with adjustable cache/block sizes and hit/miss timing; reports hits, misses, miss rate, and AMAT from traced memory addresses.
- Native RV32I programs using `blt`/`bge`, `lui`, and `auipc`; an ISA differences panel explains branch delay slots, condition codes, and immediate formats.
- Colored field-level bit diagrams for supported MIPS32 and RV32I instruction encodings.
- Fibonacci, array-maximum, and RV32I constant-construction workloads.
- Matched unrolled and looped array-sum workloads. The looped SUBLEQ version explicitly labels its indirect-address extension; the unrolled version remains the base-SUBLEQ baseline.
- Per-processor instruction mix reporting grouped into ALU, memory, branch, and combined SUBLEQ categories.
- Cache metrics in comparison tables, charts, report tables, and JSON/CSV exports.
- Four-part report methodology separating ISA facts, trace-derived counts, editable assumptions, and unavailable hardware measurements; added a version-specific RISC-V Unprivileged ISA v20260120 citation.
- Modular source tree (`engine`, `encoders`, `pipeline`, `cache`, `reports`, `ui`) and a reproducible build script that generates the offline standalone HTML.
- Behavior tests using direct module imports and golden JSON/CSV fixtures.
- Arrow-key/Home/End tab navigation, ARIA tab semantics, visible focus rings, reduced-motion intro behavior, and light/dark contrast checks.

### Validation

- `npm run verify`: build succeeds and all 12 Node test groups pass, including every one of the 12 workloads on all four models.
- `python3 browser_e2e.py`: the browser suite passed at the 3.0 release (85 checks, recorded in the 3.0 summary; this entry originally said 80 in error), including pipeline forwarding and branch penalty, cache display, Fibonacci/array maximum, encoding field diagrams, reports, print/PDF, keyboard navigation, reduced motion, contrast checks in both themes, and responsive layouts.
- Firefox and Safari remain unverified in this environment.

### Scope notes

- Pipeline and cache are educational models, not cycle-accurate or physical hardware simulators.
- x86-64 encodings remain unimplemented and code sizes remain estimates.
- The SUBLEQ indirect-address loop is a declared simulator extension, not base SUBLEQ.

## 2.1 — validation and correctness pass (2026-11-07)

- Added architecture-specific 32-bit machine-code encoders for all implemented MIPS32 and RV32I instruction forms, including correct PC-relative branch displacement.
- Enforced RV32I immediate and branch displacement limits and x86 signed immediate bounds.
- Separated the custom teaching CPU's data width from its instruction encoding width.
- Validated cycle, power, labor, and clock assumptions; corrected comparison conclusions and invalid-result handling.
- Added deterministic randomized tests and a Chromium end-to-end suite; verified report printing and mobile overflow.

## 2.0 — simulator and validation improvements

- Repaired selector handlers, report printing, x86 teaching-subset flags, assembly validation, SUBLEQ address checks, and benchmark cache keys.
- Added a clickable datapath, step-back execution, breakpoint PC, constrained custom ISA design lab, and benchmark input editor.
