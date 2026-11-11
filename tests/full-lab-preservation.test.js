/* Presentation-only redesign guard. These SHA-256 values identify the supplied
   project's unchanged source modules, so a visual update cannot silently alter
   simulation, examples, reports, or the original control handlers.
   Build first: node build.js; then node --test tests/full-lab-preservation.test.js. */
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';

const read=file=>readFileSync(new URL('../'+file,import.meta.url),'utf8');
const sourceHashes={
  "src/cache.js": "a5c3b1a6df6222b715e8ec5d04ac837ac7d7c9d4572f91c89561559212d2c79a",
  "src/custom-isa.js": "71986a451243ca411c74c093f4528f0dcb32cdb529cb565d9f1e47677ee14a66",
  "src/datapath.js": "cfc9f8c4f147ea0ee60c00a0a6afea8e5a4a8a0cdec7674621a101222a54ffb8",
  "src/demo.js": "bbfecf077f330b75468448fefb6cbd48b17b8446bdba1a9168259b404a5db077",
  "src/encoders.js": "781612097b1c699cc580bc040bfea00f95d8df72a86afeafc768648cbb440dca",
  "src/engine.js": "f91b9b6b1e5dd0c59ce1913354e09d9c8064da799fdb9a2dbe5b9d76d9642b73",
  "src/main.js": "6d1eb70d8f40e245145895f5787346b6694da8212a8b711e8ee74710fa0f14a5",
  "src/pipeline.js": "f85eda100a9c97dbb90c0882ad50357b6ca17c4faaf3702405a7b84c1e7338f8",
  "src/reports.js": "8ee750a39084d900d060105a31e67fb1a152b0736bc7b935d48516702c1b0741",
  "src/selftest.js": "a0d26bf61308846048a4f1ed299dc50e560a74e7b21e01f903276042e3a374cd",
  "src/ui-cache.js": "105528774090f32bac8644829c32fc6074bb79198622f833798747668c574933",
  "src/ui-datapath.js": "345ee2e6bd3beb89c3704618fd7b699647e7016a3b1726342a6c477d9e217dd0",
  "src/ui-demo.js": "8fc0a1b4101626be9c544ffb9fbb99faff8c644b753507491d858c1070712ea0",
  "src/ui-pipeline.js": "10af462b2594c30585edbf9d880bbb7dd550c456e3e1cb805558a75537ca9063",
  "src/ui.js": "9bae349f0cad6ed4ffb707d3f7795a202454d6995160d9c1537168bd4e1dd799",
  "src/util.js": "c99269cf1da5504fb1c781859f5a376fd40e10a1d546895ed63aab9e41fb491a"
};

test('Full Lab retains every supplied implementation module byte for byte',()=>{
  for(const [file,expected] of Object.entries(sourceHashes)){
    assert.equal(createHash('sha256').update(read(file)).digest('hex'),expected,file+' changed during a presentation-only redesign');
  }
});

function stripModule(source){
  return source
    .replace(/^import\s+[^;]+;\s*$/gm,'')
    .replace(/^export\s*\{[^}]*\};?\s*$/gm,'')
    .replace(/^export\s+(?=(?:async\s+)?(?:function|const|let|class)\b)/gm,'');
}

const removeVideo=html=>html.replace(/(<script id="intro-video-b64" type="text\/plain">)[\s\S]*?(<\/script>)/,'$1$2');

test('standalone app embeds the complete legacy interface and implementation bundle',()=>{
  const legacy=read('.quest-build/legacy-content.html');
  const standalone=removeVideo(read('processor-lab.html'));
  assert.ok(standalone.includes(legacy),'The generated app must include the complete legacy fragment without truncation or replacement');
  const build=read('build.js');
  const files=[...build.match(/const\s+files\s*=\s*(\[[\s\S]*?\]);/)[1].matchAll(/['"]([^'"]+)['"]/g)].map(m=>m[1]);
  for(const file of files.filter(file=>file!=='src/main.js')){
    assert.ok(legacy.includes(stripModule(read(file)).replace(/<\/script/gi,'<\\/script')),file+' must be bundled without implementation edits');
  }
});

test('every original teaching control and inline handler survives the Full Lab shell',()=>{
  const body=read('processor-lab.template.html').match(/<body\b[^>]*>([\s\S]*?)<\/body>/i)[1];
  const shell=body.replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi,'').trim();
  assert.ok(read('.quest-build/legacy-content.html').includes(shell),'Original teaching markup, IDs, labels, and event handlers must remain intact');
});
