# Processor Lab 4.0 — upgrade summary

Version 4.0 implements the four requested educational features on top of 3.1, fixes the defects found in a full audit, and re-validates everything. Details, the KEEP/FIX/IMPROVE/REPLACE/REMOVE table and hand calculations are in `UPGRADE_REPORT_4.0.md`.

| Requested item | Result |
|---|---|
| Interactive pipeline explanation | Done, inside the existing pipeline mode (no duplicate panel). Values verified per operand. |
| Visual datapath per instruction | Done; replaces the 3.x generic datapath. MIPS32 and RV32I textbook datapaths; SUBLEQ and x86 labelled conceptual. |
| Advanced cache visualisation | Done; the cache engine is now set-associative with replacement and write policies, and is used everywhere. |
| Professor demonstration mode | Done; three experiments, each runnable, steppable, resettable and exportable. |

## Verification results

- `npm run verify`: 102 Node tests pass, none skipped.
- `python3 browser_e2e.py`: 147 Chromium checks pass (Chromium 153), no JavaScript errors.
- `browser-selftest.html`: 76 of 76 checks pass in Chromium.
- Firefox and Safari remain unverified until you run `CROSS_BROWSER_CHECKLIST.md` on the presentation machine.

## Explicit limitations retained

- The pipeline is an in-order, single-issue model for RV32I and MIPS32 only, with a fixed branch penalty.
- The cache models data accesses only, single level.
- The looped SUBLEQ array sum uses an explicitly disclosed indirect-address extension.
- x86-64 machine-code encoding remains unimplemented; x86 code size is estimated.
- The FIB workload handles F(0) = 0 through F(15) = 610 on all four models (fixed in 3.1).
- All cycle, power, clock and cache timing values remain editable assumptions, not measurements.
