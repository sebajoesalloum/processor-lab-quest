import {readFile,writeFile} from 'node:fs/promises';
import {resolve,dirname} from 'node:path';
import {fileURLToPath} from 'node:url';
const root=dirname(fileURLToPath(import.meta.url));
const files=['src/util.js','src/engine.js','src/encoders.js','src/datapath.js','src/pipeline.js','src/cache.js','src/demo.js','src/custom-isa.js','src/reports.js','src/ui.js','src/ui-pipeline.js','src/ui-datapath.js','src/ui-cache.js','src/ui-demo.js','src/main.js'];
function stripModule(source){
 return source
  .replace(/^import\s+[^;]+;\s*$/gm,'')
  .replace(/^export\s*\{[^}]*\};?\s*$/gm,'')
  .replace(/^export\s+(?=(?:async\s+)?(?:function|const|let|class)\b)/gm,'');
}
const parts=[];
for(const file of files){const source=await readFile(resolve(root,file),'utf8');parts.push(`\n/* ===== ${file} ===== */\n${stripModule(source)}`)}
const template=await readFile(resolve(root,'processor-lab.template.html'),'utf8');
if(!template.includes('/*__PROCESSOR_LAB_BUNDLE__*/'))throw new Error('Bundle marker is missing from processor-lab.template.html');
if(!template.includes('/*__INTRO_VIDEO_B64__*/'))throw new Error('Intro video marker is missing from processor-lab.template.html');
const introVideo=(await readFile(resolve(root,'assets/intro.mp4'))).toString('base64');
const output=template.replace('/*__INTRO_VIDEO_B64__*/',()=>introVideo).replace('/*__PROCESSOR_LAB_BUNDLE__*/',()=>parts.join('\n'));
await writeFile(resolve(root,'processor-lab.html'),output);
console.log(`Built processor-lab.html from ${files.length} source modules (${output.length.toLocaleString()} characters).`);
// Browser self-test page: same engine modules + the in-browser test runner.
const testFiles=['src/util.js','src/engine.js','src/encoders.js','src/datapath.js','src/pipeline.js','src/cache.js','src/demo.js','src/custom-isa.js','src/selftest.js'];
const testParts=[];
for(const file of testFiles){const source=await readFile(resolve(root,file),'utf8');testParts.push(`\n/* ===== ${file} ===== */\n${stripModule(source)}`)}
const testTemplate=await readFile(resolve(root,'browser-selftest.template.html'),'utf8');
if(!testTemplate.includes('/*__PROCESSOR_LAB_BUNDLE__*/'))throw new Error('Bundle marker is missing from browser-selftest.template.html');
await writeFile(resolve(root,'browser-selftest.html'),testTemplate.replace('/*__PROCESSOR_LAB_BUNDLE__*/',()=>testParts.join('\n')));
console.log('Built browser-selftest.html');

// UI-only Quest build: retain every original module and template above, then
// present their generated content inside the new editable interface.
const {copyFile,mkdir}=await import('node:fs/promises');
await mkdir(resolve(root,'.quest-build'),{recursive:true});
await copyFile(resolve(root,'processor-lab.html'),resolve(root,'.quest-build/processor-lab-original.html'));
await import('./ui/prepare-legacy.cjs');
await import('./ui/assemble-quest.cjs');
