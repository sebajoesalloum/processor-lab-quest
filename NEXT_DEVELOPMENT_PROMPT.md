# Processor Lab 4.0 — continuation prompt

Continue upgrading the attached Processor Lab 4.0 source rather than replacing it. Preserve the exact author credit **Created by Student Seba Joe Salloum**, the purple/lavender UI, eleven sections (including Cache Lab and Professor Demo), four reference models, custom ISA lab, datapath, debugging controls, twelve workloads, offline build, and all passing tests.

## Current architecture

- Editable modules live in `src/`: `util.js`, `engine.js`, `encoders.js`, `datapath.js`, `pipeline.js`, `cache.js`, `demo.js`, `custom-isa.js`, `reports.js`, `selftest.js`, and the UI modules `ui.js`, `ui-pipeline.js`, `ui-datapath.js`, `ui-cache.js`, `ui-demo.js`, `main.js`. The bundle is one shared script scope, so top-level names must be unique across modules.
- `npm run build` bundles those sources into the standalone `processor-lab.html` using `processor-lab.template.html`.
- `npm test` imports modules directly and runs behavior, regression, randomized, pipeline and documentation-consistency tests plus JSON/CSV golden tests.
- `python3 browser_e2e.py [--browser chromium|firefox|webkit]` runs UI tests where Playwright and the browser are installed; `browser-selftest.html` and `CROSS_BROWSER_CHECKLIST.md` cover Firefox/Safari manually.

## Implemented in 3.0

- Selectable five-stage pipeline with forwarding, stalls, load-use bubbles, branch penalty, cycle diagram, and hand-checked CPI tests.
- Direct-mapped data cache with configurable geometry and AMAT from actual traced memory addresses.
- Native RV32I idioms (`blt`, `bge`, `lui`, `auipc`) and field-level MIPS32/RV32I encoding diagrams.
- Fibonacci, array maximum, constant construction, and matched unrolled/looped array sum benchmarks.
- Instruction mix categories, methodology-rich reports, cache-aware JSON/CSV exports.
- Modular source and build process; keyboard navigation, ARIA tabs, focus, reduced motion, and tested contrast pairs.

## Implemented in 3.1

- Restored regression and randomized tests, strict pipeline decoder, taken-only branch penalty option, cross-browser tooling, and documentation-consistency tests.

## Implemented in 4.0

- Interactive pipeline explanation with per-operand verification, architecture-specific datapath walk-through, set-associative Cache Lab with 3C analysis, professor demonstration mode, calculated/estimated value labels, and the fixes listed in `CHANGELOG.md`.

## Next priorities

1. Cross-check every supported MIPS32/RV32I encoding against independent assemblers and add additional golden vectors.
2. Run the self-test page and manual checklist in Firefox and Safari on the actual target device; retain Chromium tests.
3. Complete a screen-reader and broader WCAG accessibility audit.
4. If useful for the course, extend the pipeline with explicit branch flush policies, structural hazards, and cache-stall integration, while keeping each assumption editable and labeled.
5. Consider an instruction cache or a two-level hierarchy, again only with hand-calculated tests; consider branch resolution in ID as a selectable pipeline variant.
6. Keep x86-64 code sizes labeled as estimates unless a real encoder is independently validated.

Do not invent hardware performance, area, transistor counts, measured power, chip cost, or unsupported ISA behavior. Preserve the report's separation of ISA facts, trace-derived counts, editable assumptions, and unavailable measurements. Run `npm run verify` and the Chromium browser suite after changes.
