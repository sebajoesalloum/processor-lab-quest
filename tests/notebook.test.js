import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import {mk,step} from '../src/engine.js';
import {explainPipeline} from '../src/pipeline.js';
import {simulateCache} from '../src/cache.js';

// Run the actual controller with real simulators and a minimal DOM adapter.
function quest(saved){
  const nodes=new Map();let focused=null,persisted=null;
  function node(selector){
    if(selector==='#intro')return null;
    if(!nodes.has(selector))nodes.set(selector,{
      dataset:{},value:'',textContent:'',innerHTML:'',disabled:false,hidden:false,
      classList:{contains:()=>false,toggle(){}},style:{setProperty(){}},
      listeners:{},addEventListener(type,fn){this.listeners[type]=fn;},
      querySelector:s=>node(s),querySelectorAll:()=>[],setAttribute(){},removeAttribute(){},
      focus(){focused=selector;},checkValidity:()=>true
    });
    return nodes.get(selector);
  }
  const root=node('root');
  const window={openai:{widgetState:saved,setWidgetState(s){persisted=s;return Promise.resolve();}},addEventListener(){}};
  const source=readFileSync(new URL('../ui/quest-interface.html',import.meta.url),'utf8').split('<script>')[1].split('</script>')[0];
  vm.runInNewContext(source,{document:{getElementById:()=>root},window,mk,step,explainPipeline,simulateCache,
    go(){},hasIntroVideo:false,MutationObserver:class{observe(){}},Blob,URL,setTimeout});
  return {
    node,click(s){node(s).listeners.click();},
    change(s,value){node(s).value=value;node(s).listeners.change({target:node(s)});},
    answer(value){root.listeners.click({target:{closest:s=>s==='[data-pq-answer]'?{dataset:{pqAnswer:value}}:null}});},
    saved:()=>persisted,focused:()=>focused
  };
}

test('screenshot case guides incorrect SUBLEQ prediction, then records and restores evidence',()=>{
  const q=quest();q.change('[data-pq-mission]','subleq');
  q.answer('0');q.click('[data-pq-next]');q.change('[data-pq-explanation]','nonpositive');
  assert.match(q.node('[data-pq-record-hint]').textContent,/Revise your prediction/);
  assert.doesNotMatch(q.node('[data-pq-record-hint]').textContent,/Execute|Choose the cause/);
  assert.equal(q.node('[data-pq-record]').disabled,false);
  q.click('[data-pq-record]');assert.equal(q.focused(),'[data-pq-answer]');
  assert.equal(q.saved().privateContent.notes.length,0);
  q.answer('-2');assert.equal(q.node('[data-pq-record]').textContent,'Record evidence in notebook');
  q.click('[data-pq-record]');
  assert.equal(q.saved().privateContent.route,'notebook');
  assert.equal(q.saved().privateContent.notes.length,1);
  assert.equal(q.saved().privateContent.notes[0].result,'B = -2; next PC = 6');
  const restored=quest(q.saved());
  assert.equal(restored.node('[data-pq-note-count]').textContent,1);
  assert.match(restored.node('[data-pq-notes]').innerHTML,/B = -2; next PC = 6/);
  q.change('[data-pq-mission]','subleq');q.answer('-2');q.click('[data-pq-finish]');q.change('[data-pq-explanation]','nonpositive');q.click('[data-pq-record]');
  assert.equal(q.saved().privateContent.notes.length,1,'same case is not duplicated');
});

test('missing observation and explanation are actionable; a new case resets checks',()=>{
  const q=quest();q.change('[data-pq-mission]','subleq');q.answer('-2');
  q.click('[data-pq-record]');assert.equal(q.focused(),'[data-pq-next]');
  q.click('[data-pq-next]');q.click('[data-pq-record]');assert.equal(q.focused(),'[data-pq-explanation]');
  q.change('[data-pq-explanation]','always');q.click('[data-pq-record]');
  assert.match(q.node('[data-pq-record-hint]').textContent,/Revise the cause/);
  q.change('[data-pq-explanation]','nonpositive');q.node('[data-pq-input]').value=2;q.click('[data-pq-transfer]');
  assert.match(q.node('[data-pq-record-hint]').textContent,/Choose a prediction.*Execute.*Choose the cause/);
  q.answer('1');q.click('[data-pq-next]');q.change('[data-pq-explanation]','nonpositive');q.click('[data-pq-record]');
  assert.equal(q.saved().privateContent.notes[0].result,'B = 1; next PC = 1');
});

for(const [mission,answer,cause] of [['pipeline','5','load'],['cache','miss','conflict']]){
  test(`${mission} can still record completed evidence`,()=>{
    const q=quest();q.change('[data-pq-mission]',mission);q.answer(answer);q.click('[data-pq-finish]');q.change('[data-pq-explanation]',cause);q.click('[data-pq-record]');
    assert.equal(q.saved().privateContent.notes.length,1);
    assert.equal(q.saved().privateContent.notes[0].mission,mission);
  });
}
