import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';

// This adapter supplies DOM events and generated library elements. The real
// Quest controller owns filtering, routing, context, and reading-detail state.
function lab({lab='over',detail='all',headings=[]}={}){
  const nodes=new Map(),calls=[],levels=[];
  let links=[],groups=[],persisted=null,focused=null,headingElements=[];
  const strip=s=>s.replace(/<[^>]*>/g,' ').replace(/&amp;/g,'&').replace(/\s+/g,' ').trim();
  function element(){
    const attributes=new Map();
    return {
      dataset:{},value:'',textContent:'',disabled:false,hidden:false,listeners:{},
      classList:{contains:()=>false,toggle(){},add(){},remove(){}},style:{setProperty(){}},
      addEventListener(type,fn){this.listeners[type]=fn;},
      setAttribute(key,value){attributes.set(key,String(value));},
      removeAttribute(key){attributes.delete(key);},
      getAttribute(key){return attributes.get(key)??null;},
      focus(){focused=this;},scrollIntoView(){},
      querySelectorAll:()=>[],querySelector:()=>null
    };
  }
  function select(selector){
    if(selector.includes('data-pq-lab-link'))return selector.includes(':not([hidden])')?links.filter(link=>!link.hidden):links;
    if(selector.includes('.pq-library-group'))return groups;
    return [];
  }
  function node(selector){
    if(selector==='#intro')return null;
    if(!nodes.has(selector)){
      const n=element();let html='';
      n.querySelectorAll=s=>selector==='#v'&&s==='h1,h2,h3,h4'?headingElements:select(s);
      n.querySelector=s=>node(s);
      Object.defineProperty(n,'innerHTML',{
        get:()=>html,
        set(value){
          html=value;
          if(selector!=='[data-pq-library]')return;
          links=[];groups=[];
          const chunks=value.split(/<(?:div|section)\b[^>]*class="[^"]*\bpq-library-group\b[^"]*"[^>]*>/).slice(1);
          for(const chunk of chunks){
            const group=element(),children=[];
            for(const match of chunk.matchAll(/<button\b([^>]*data-pq-lab-link="([^"]+)"[^>]*)>([\s\S]*?)<\/button>/g)){
              const link=element();link.dataset.pqLabLink=match[2];link.textContent=strip(match[3]);
              for(const attr of match[1].matchAll(/data-([a-z-]+)="([^"]*)"/g)){
                link.dataset[attr[1].replace(/-([a-z])/g,(_,c)=>c.toUpperCase())]=attr[2];
              }
              link.closest=s=>s==='.pq-library-group'?group:null;
              links.push(link);children.push(link);
            }
            group.querySelectorAll=s=>s.includes('data-pq-lab-link')?(s.includes(':not([hidden])')?children.filter(child=>!child.hidden):children):[];
            group.querySelector=s=>group.querySelectorAll(s)[0]??null;
            groups.push(group);
          }
        }
      });
      nodes.set(selector,n);
    }
    return nodes.get(selector);
  }
  const root=node('root');root.querySelectorAll=select;
  headingElements=headings.map(heading=>({
    id:'',textContent:heading.text,
    closest(selector){return selector.split(',').some(part=>part==='[hidden]'?heading.hidden:(heading.classes||[]).includes(part.slice(1)))?{}:null;}
  }));
  const window={openai:{widgetState:{privateContent:{questVersion:1,route:'lab',lab,detail}},setWidgetState(s){persisted=s;return Promise.resolve();}},addEventListener(){}};
  const source=readFileSync(new URL('../ui/quest-interface.html',import.meta.url),'utf8').split('<script>')[1].split('</script>')[0];
  vm.runInNewContext(source,{
    document:{getElementById:()=>root},window,
    go(section){calls.push(section);},setLv(level){levels.push(level);},
    MutationObserver:class{observe(){}},Blob,URL,setTimeout
  });
  return {
    node,calls,levels,links:()=>links,groups:()=>groups,saved:()=>persisted,focused:()=>focused,
    event(selector,type,value){const n=node(selector);if(value!==undefined)n.value=value;assert.equal(typeof n.listeners[type],'function',`${selector} needs a ${type} handler`);n.listeners[type]({target:n});},
    click(selector){const n=node(selector);if(!n.disabled)this.event(selector,'click');}
  };
}

test('library search finds topic aliases without navigating or resetting the lab',()=>{
  const q=lab({lab:'cache',detail:'p'}),before=[...q.calls];
  assert.equal(q.links().length,11,'all original lab sections remain in the library');
  q.event('[data-pq-library-search]','input','PIPELINE');
  assert.deepEqual(q.links().filter(link=>!link.hidden).map(link=>link.dataset.pqLabLink),['sim']);
  assert.ok(q.groups().some(group=>group.hidden),'groups without matches are hidden');
  assert.match(q.node('[data-pq-search-status]').textContent,/1/);
  assert.deepEqual(q.calls,before,'filtering must not invoke the original go() handler');
  assert.equal(q.node('[data-pq-lab-section]').value,'cache');
  assert.equal(q.node('[data-pq-detail]').value,'p');
  q.event('[data-pq-library-search]','input','CACHE');
  assert.deepEqual(q.links().filter(link=>!link.hidden).map(link=>link.dataset.pqLabLink),['cache']);
});

test('empty search results are recoverable with the clear control',()=>{
  const q=lab(),before=[...q.calls];
  q.event('[data-pq-library-search]','input','no such subject 12345');
  assert.equal(q.links().filter(link=>!link.hidden).length,0);
  assert.ok(q.groups().every(group=>group.hidden));
  assert.match(q.node('[data-pq-search-status]').textContent,/0|no .*found|no .*match/i);
  q.click('[data-pq-library-clear]');
  assert.equal(q.node('[data-pq-library-search]').value,'');
  assert.equal(q.links().filter(link=>!link.hidden).length,11);
  assert.ok(q.groups().every(group=>!group.hidden));
  assert.equal(q.node('[data-pq-library-clear]').hidden,true);
  assert.equal(q.focused(),q.node('[data-pq-library-search]'));
  assert.deepEqual(q.calls,before,'search and clear leave the original lab running');
});

test('topic index respects hidden content and updates when reading detail changes',()=>{
  const q=lab({detail:'b',headings:[
    {text:'Visible introduction'},
    {text:'Professional timing details',classes:['pro']},
    {text:'Visible next steps'},
    {text:'Hidden experiment',hidden:true}
  ]});
  const index=q.node('[data-pq-page-index]');
  const optionAnchors=()=>new Map([...index.innerHTML.matchAll(/<option value="([^"]+)">([^<]*)<\/option>/g)].map(match=>[match[2],match[1]]));
  assert.match(index.innerHTML,/Visible introduction/);
  assert.match(index.innerHTML,/Visible next steps/);
  assert.doesNotMatch(index.innerHTML,/Professional timing details|Hidden experiment/);
  const beginnerAnchors=optionAnchors();
  q.event('[data-pq-detail]','change','all');
  assert.match(index.innerHTML,/Professional timing details/);
  assert.doesNotMatch(index.innerHTML,/Hidden experiment/);
  const allAnchors=optionAnchors();
  assert.equal(allAnchors.size,3);
  assert.equal(new Set(allAnchors.values()).size,3,'each visible heading has a unique jump target after revealing interleaved content');
  for(const [label,anchor] of beginnerAnchors)assert.equal(allAnchors.get(label),anchor,'existing heading anchors stay stable when revealing detail');
  assert.equal(q.levels.at(-1),'all');
  assert.equal(q.saved().privateContent.detail,'all');
  q.event('[data-pq-detail]','change','b');
  assert.deepEqual(optionAnchors(),beginnerAnchors,'returning to Beginner restores the same jump targets');
});

test('next and previous retain reading detail and call the original section handler',()=>{
  const q=lab({detail:'p'});
  assert.equal(q.node('[data-pq-section-title]').textContent,'Overview');
  assert.equal(q.node('[data-pq-section-prev]').disabled,true);
  assert.equal(q.node('[data-pq-section-next]').disabled,false);
  const count=q.calls.length;
  q.click('[data-pq-section-prev]');assert.equal(q.calls.length,count);
  q.click('[data-pq-section-next]');
  assert.equal(q.calls.at(-1),'build');
  assert.equal(q.calls.length,count+1,'next calls the original navigation exactly once');
  assert.equal(q.node('[data-pq-section-title]').textContent,'Processor Construction & Custom ISA');
  assert.ok(q.node('[data-pq-section-tip]').textContent.trim());
  assert.equal(q.saved().privateContent.detail,'p');
  assert.equal(q.node('[data-pq-detail]').value,'p');
  assert.equal(q.levels.at(-1),'p');
  q.click('[data-pq-section-prev]');
  assert.equal(q.calls.at(-1),'over');
  assert.equal(q.node('[data-pq-section-title]').textContent,'Overview');
});

test('section selection and sequence navigation stay synchronized at the final section',()=>{
  const q=lab({detail:'i'});
  q.event('[data-pq-lab-section]','change','cmp');
  assert.equal(q.calls.at(-1),'cmp');
  assert.equal(q.node('[data-pq-section-title]').textContent,'Compare & Reports');
  q.click('[data-pq-section-next]');
  assert.equal(q.calls.at(-1),'demo');
  assert.equal(q.node('[data-pq-lab-section]').value,'demo');
  assert.equal(q.node('[data-pq-section-title]').textContent,'Professor Demo');
  assert.equal(q.node('[data-pq-section-next]').disabled,true);
  assert.equal(q.node('[data-pq-section-prev]').disabled,false);
  assert.equal(q.saved().privateContent.detail,'i');
  const count=q.calls.length;q.click('[data-pq-section-next]');assert.equal(q.calls.length,count);
  q.click('[data-pq-section-prev]');
  assert.equal(q.calls.at(-1),'cmp');
  assert.equal(q.node('[data-pq-lab-section]').value,'cmp');
});
