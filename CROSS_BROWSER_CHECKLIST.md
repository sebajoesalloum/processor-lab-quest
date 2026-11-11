# Cross-browser check for Processor Lab 4.0 (Firefox and Safari)

Firefox and Safari were **not** available where this project was built, so they have **not** been verified by anyone yet. This page is how you verify them on the machine you will present from. It takes about 10 minutes per browser.

## Step 1 — one-click engine self-test (1 minute)

1. Open `browser-selftest.html` in the browser (double-click it; no server needed).
2. Read the banner. **PASS** means the browser runs all 12 workloads on all 4 processor models, the pipeline (both branch policies), the cache, the encodings and the custom ISA with the same results as the Node tests. **FAIL** lists exactly which check failed. Do not present from that browser until it passes.
3. Press *Copy report* and paste it into your notes. It records the browser version.

The self-test checks JavaScript behaviour only. It cannot tell you whether the pages look right, so continue with Step 2.

## Step 2 — manual walkthrough of `processor-lab.html`

Tick each item. Stop and note the browser and version if anything looks wrong.

- [ ] Opens from disk (`file://`), the intro video plays (muted with a "Sound on" button if the browser blocks autoplay) or can be skipped, and the purple/lavender theme loads.
- [ ] All eleven tabs open, and the header's *Professor demo* button opens the demonstration. With a tab focused, Left/Right arrows, Home and End move between tabs and a visible focus ring appears.
- [ ] **Execution Simulator:** choose RV32I + FIB, press *Step instruction* several times, press *Step back*. Registers and the datapath highlight change and revert correctly.
- [ ] **Pipeline mode:** switch the timing model to *Five-stage pipeline (explained)*. The cycle diagram renders with no overlapping or clipped cells. Untick *Forwarding*; the cycle count rises. Change *applies to* from *every branch* to *taken branches only* on the loop demo; the branch-penalty cycles fall.
- [ ] The pipeline's ISA selector offers only RV32I and MIPS32 (x86 and SUBLEQ are intentionally not modeled).
- [ ] **Datapath:** in *Multicycle + datapath*, choose MIPS32 + Addition, press *Step instruction* three times, then *Phase ▶*. Highlighted boxes and wires move phase by phase and the wire labels show 7, 5 and 12. Repeat with RV32I, SUBLEQ and x86 (the last two say *Conceptual execution model*).
- [ ] **Pipeline explanation:** choose *Hazard demo: load-use*, step to cycle 4 (ID shows STALLED, EX shows a bubble) and cycle 5 (the green MEM/WB → EX path shows t0 = 7).
- [ ] **Cache Lab:** press each experiment button, step with *Next access*, and check that the cache table, address bits and history update.
- [ ] **Professor Demo:** run all three experiments, step through each, export the JSON, press Reset, and return to the simulator.
- [ ] **Processor Construction → ISA design lab:** run the preloaded program (stores 12 in cell 3); change registers 4 → 8 and the encoding width.
- [ ] **Instruction Explorer:** RV32I `lw t0,0(a0)` shows `0x00052283`; the colored bit-field diagram renders.
- [ ] **Benchmarks:** change an input, run all four models, press *Restore originals*.
- [ ] **Compare & Reports:** the table, charts and cache columns render. Click *Download CSV*, *Download JSON* and *Download HTML*: each file is saved and opens. (Safari sometimes asks where to save or shows a download prompt; this is normal.)
- [ ] **Print / PDF:** use the report's print button, choose *Save as PDF* in the print dialog, A4. Expect two pages with the title, author credit, methodology section and result tables, and no cut-off tables.
- [ ] Switch the operating system between light and dark mode (or use the app's theme control). Text stays readable in both.
- [ ] Turn on the OS "reduce motion" setting and reload. The intro video is skipped.
- [ ] Resize the window to about 1280 × 720 (a typical projector) and zoom to 125%. Nothing important is cut off and there is no sideways page scroll.
- [ ] Turn Wi-Fi off and reload. Everything still works (the app is fully offline).
- [ ] Open the browser's developer console during the walkthrough. There should be no red errors.

## Minimum browser versions

Run `node compat_scan.mjs`. For the current build it reports that the lowest versions supporting every detected feature are **Firefox 85+ and Safari 15.4+**, mostly because of the CSS `:focus-visible` rule. On older browsers the app logic still runs, but keyboard focus rings will not be drawn. `Object.hasOwn()` was removed from the code in 3.1 so older Safari/Firefox versions no longer crash on it. The scan is static; the version table inside it is from memory of MDN data, so confirm on caniuse.com before quoting it in a report.

## Optional: automated runs in other engines

If you have Python and a network connection on your own computer:

```sh
pip install playwright
python3 -m playwright install firefox webkit
python3 browser_e2e.py --browser firefox
python3 browser_e2e.py --browser webkit
```

`webkit` is the engine Safari is built on, which makes it a useful approximation, but it is **not Safari itself**. Playwright can only generate PDFs in Chromium, so those two runs report the PDF check as skipped; do the manual print check above. Record the results next to the Chromium results.

## What to write in your report

Say exactly what was done, for example: "Automated tests ran in Chromium 153. The engine self-test passed in Firefox NN and Safari NN on the presentation laptop on DD/MM/YYYY, and the manual walkthrough was completed." Do not claim automated Firefox or Safari testing unless you ran it.
