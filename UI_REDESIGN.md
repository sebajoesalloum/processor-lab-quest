# Processor Lab Quest: editable interface redesign

Open **processor-lab.html** in a desktop browser. It is the complete offline
application, with the original introduction video included. No server, login,
package installation, or network connection is needed to run it.

The interface adds a mission map, playable pipeline/cache/SUBLEQ investigations,
prediction and explanation checks, and a browser-local evidence notebook. All
eleven original sections remain available in **Full Lab**. Choose **All
information** to show the beginner, intermediate, and advanced explanations
together. Original simulations, assumptions, formulas, glossary, quizzes,
settings, exports, examples, and academic limitations remain available.

## Edit the interface

The new presentation is editable in `ui/quest-interface.html`. It contains the
Quest markup, scoped styles, and interaction code. Preserve its single
`<!-- LEGACY_CONTENT -->` marker: the build fills it with the complete original
teaching interface and engines.

With Node.js 18 or newer installed, run:

```sh
npm run build
npm run verify
```

`build` regenerates `processor-lab.html` and the original `browser-selftest.html`.
`verify` builds the application and runs the original Node test suite.

## Content and engine preservation

All sixteen files in `src/` and `processor-lab.template.html` are included
byte-for-byte from the supplied Processor Lab 4.0 project. No simulation source
or original teaching text was rewritten for the redesign. The original build
continues to generate its complete application before the Quest assembly step.

`ui/prepare-legacy.cjs` scopes the original stylesheet to the Full Lab surface
and changes only the generated startup: all reading detail is initially
available. The Quest interface presents the original introduction video at
startup with Pause, Replay, Sound, and Skip controls. Reduced-motion mode shows
the introduction paused. The footer also allows replaying it later. `ui/assemble-quest.cjs`
combines that layer with the new interface and embeds the original video.
Both helpers use only the Node standard libraries and project-relative paths.

Generated intermediate files live in `.quest-build/`, including the untouched
classic build and a module preservation manifest. They can be regenerated with
`npm run build`. The delivered source hash inventory is in
`ui/original-source-sha256.json`.

The original README, tests, tools, screenshots, results, and documentation are
retained. Historical verification reports describe the supplied 4.0 project;
fresh build and test output describes the current checkout. As before, these
are educational processor subsets and timing models, not hardware measurements.

## Verification notes

The delivered Quest build was regenerated from this source project. The
original Node suite completed with 100 passes, 0 failures, and 2 skips because
GNU MIPS/RISC-V binutils were unavailable. All 11 Full Lab sections were also
opened in the rebuilt application with no JavaScript errors, and the original
source/template hashes match the supplied project.

The retained `browser_e2e.py` is the original browser suite. Some of its visible
header and navigation expectations target the old interface, so it is not an
unchanged end-to-end test for the Quest layout. Engine tests and current
interface/content-preservation checks are separate from that historical suite.
