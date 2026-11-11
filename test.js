import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {run,WL,MODELS,PROG,asm,mk,step,snapshotState,restoreState} from './src/engine.js';
import {encodeInstruction,encodingFields} from './src/encoders.js';
import {simulatePipeline} from './src/pipeline.js';
import {simulateDirectMappedCache} from './src/cache.js';
import {buildSnapshot,resultsToCSV} from './src/reports.js';
import {runSelfTests} from './src/selftest.js';

const archs=Object.keys(MODELS);
test('every benchmark produces its expected output on every model',()=>{
 for(const workload of WL) for(const arch of archs){
  const result=run(arch,workload);
  assert.equal(result.ok,true,`${workload.id} on ${arch}: ${result.err||result.got}`);
  assert.equal(result.got,workload.ex,`${workload.id} on ${arch}`);
 }
});
test('RV32I examples use native branches and U-type constant/address idioms',()=>{
 assert.match(PROG.MAX.rv.join('\n'),/blt/);
 assert.match(PROG.MAXARR.rv.join('\n'),/bge/);
 assert.match(PROG.ARR_LOOP.rv.join('\n'),/auipc/);
 assert.match(PROG.CONST.rv.join('\n'),/lui/);
 assert.doesNotMatch(PROG.MAX.rv.join('\n'),/slt/);
 assert.doesNotMatch(PROG.ARR.rv.join('\n'),/loop:/);
 assert.match(PROG.ARR_LOOP.rv.join('\n'),/loop:/);
});
test('five independent instructions have the hand-calculated fill/drain CPI',()=>{
 const p=simulatePipeline(['add t0,t1,t2','add t3,t4,t5','sub t6,t0,t2','addi t1,t1,1','sw t3,0(a0)'],{arch:'rv',forwarding:true,branchPenalty:0});
 assert.equal(p.cycles,9);
 assert.equal(p.instructions,5);
 assert.equal(p.cpi,1.8);
 assert.equal(p.dataStalls,0);
});
test('forwarding removes ALU RAW stalls but retains one load-use bubble',()=>{
 const seq=['lw t0,0(a0)','add t1,t0,t2','add t3,t1,t2'];
 const on=simulatePipeline(seq,{arch:'rv',forwarding:true,branchPenalty:0});
 const off=simulatePipeline(seq,{arch:'rv',forwarding:false,branchPenalty:0});
 assert.equal(on.dataStalls,1);
 assert.equal(off.dataStalls,4);
 assert.ok(off.cycles>on.cycles);
});
test('branch penalty is an explicit additive assumption',()=>{
 const seq=['beq t0,t1,target','addi t2,t2,1','target: addi t3,t3,1'];
 const noPenalty=simulatePipeline(seq,{arch:'rv',branchPenalty:0});
 const penalty=simulatePipeline(seq,{arch:'rv',branchPenalty:3});
 assert.equal(penalty.branchBubbles,3);
 assert.equal(penalty.cycles-noPenalty.cycles,3);
});
test('direct-mapped cache hit, miss, and AMAT math matches hand calculation',()=>{
 const c=simulateDirectMappedCache([0,4,16,0].map(address=>({address,type:'read'})),{cacheSize:64,blockSize:16,hitTime:1,missPenalty:20});
 assert.equal(c.hits,2);assert.equal(c.misses,2);assert.equal(c.missRate,.5);assert.equal(c.amat,11);
});
test('direct-mapped cache rejects invalid non-power-of-two geometry',()=>{
 assert.throws(()=>simulateDirectMappedCache([],{cacheSize:48,blockSize:16}),/powers of two/);
});
test('SUBLEQ looped array workload uses its explicit indirect-address extension',()=>{
 const w=WL.find(x=>x.id==='ARR_LOOP'),r=run('sq',w);
 assert.equal(r.ok,true);assert.ok(r.accesses.some(a=>a.indirectPointer));
 assert.match(PROG.ARR_LOOP.sq.join('\n'),/@14/);
});
test('field diagrams account for all 32 bits and encodings match known words',()=>{
 const lui=asm(MODELS.rv,PROG.CONST.rv)[0],encoded=encodeInstruction('rv',lui,0);
 assert.equal(encoded.hex,'0x000012B7');
 assert.equal(encodingFields('rv',lui,0).reduce((n,f)=>n+f.bits,0),32);
 const add=asm(MODELS.mips,PROG.ADD.mips)[2];
 assert.equal(encodeInstruction('mips',add,2).hex,'0x01095021');
 assert.equal(encodingFields('mips',add,2).reduce((n,f)=>n+f.bits,0),32);
});
test('RV32I B-type and AUIPC encodings preserve split immediate fields',()=>{
 const max=asm(MODELS.rv,PROG.MAX.rv),blt=max.find(i=>i.t.startsWith('blt'));
 assert.equal(encodeInstruction('rv',blt,2).hex,'0x0062C663');
 assert.equal(encodingFields('rv',blt,2).reduce((n,f)=>n+f.bits,0),32);
 const auipc=asm(MODELS.rv,PROG.ARR_LOOP.rv)[0];
 assert.equal(encodeInstruction('rv',auipc,0).hex,'0x00000E17');
});
test('engine snapshots restore trace and memory state',()=>{
 const s=mk('rv',WL.find(x=>x.id==='ADD'));step(s);const snap=snapshotState(s);step(s);restoreState(s,snap);assert.equal(s.c.dyn,1);assert.equal(s.pc,1);assert.equal(s.tr.length,1);
});
test('JSON snapshot and CSV export match golden files',async()=>{
 const fixture={lab:'Processor Lab test',credit:'test fixture',settings:{clock_mhz:100,cache:{cacheSize:64,blockSize:16}},workloads:[{id:'ADD'}],programs:{ADD:{rv:['addi t0,zero,1']}},limit:2000,results:[{model:'rv',workload:'ADD',static:1,dynamic:1,cycles:5,cpi:'5.00',pipeline_cycles:5,pipeline_cpi:'5.000',time_ns:50,energy_nj:'20.00',reads:0,writes:0,code_bytes:4,cache_hits:0,cache_misses:1,cache_miss_rate:'1.00',amat_cycles:'21.00',ok:true}]};
 const json=JSON.stringify(buildSnapshot(fixture),null,1)+'\n';
 const csv=resultsToCSV(fixture.results)+'\n';
 assert.equal(json,await readFile(new URL('./tests/golden/export.json',import.meta.url),'utf8'));
 assert.equal(csv,await readFile(new URL('./tests/golden/export.csv',import.meta.url),'utf8'));
});
test('in-browser self-test checks (engine, pipeline, cache, encodings, custom ISA) all pass under Node',()=>{
 const rows=runSelfTests().filter(r=>r.group!=='JavaScript features');   // those probe browser-only APIs
 assert.ok(rows.length>=60,'expected the full self-test list, got '+rows.length);
 assert.deepEqual(rows.filter(r=>!r.ok),[]);
});
