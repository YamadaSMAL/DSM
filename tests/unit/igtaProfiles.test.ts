import {expect,it} from 'vitest';
import fc from 'fast-check';
import {fromRows,createMatrixData,preprocess,structureMetrics} from '../../src/domain';
import {provenance} from '../helpers';
import {PLUS_ID,GIGTA_ID,normalizeMdlInput,mdlMetric,totalCostEvaluator,bidValue,encodeBits,decodeBits,legalizeBits,sigmaFitness,sus,evaluatePair} from '../../src/algorithms/igtaProfile';
import {mulberry32} from '../../src/algorithms/random';
import {runAnalysis,comparisonKey,isRankable} from '../../src/algorithms/registry';
import {importFile} from '../../src/io/import';
import {defaultOptions} from '../../src/io/types';
import {parseSession,serializeSession,type SessionData} from '../../src/io/session';
import {initialView} from '../../src/state/views';
const modules=[[0,1,0,0],[1,0,0,0],[0,0,0,1],[0,0,1,0]];
const source=(rows:number[][])=>createMatrixData(rows,{convention:'row-depends-on-column',provenance});
it('spec 9.1-9.3: asymmetric TotalCost / bids / MDL golden values',()=>{
 expect(totalCostEvaluator(fromRows([[0,5,1],[2,0,3],[4,0,0]]),1)([0,0,1])).toBe(38);
 expect(bidValue(3,4)).toBe(20.25);expect(bidValue(2,3)).toBe(16/3);
 const p=normalizeMdlInput(fromRows(modules));for(const [m,value]of [[[0,0,1,1],.6664],[[0,0,0,0],3.6738],[[0,1,2,3],14.0798]]as const)expect(mdlMetric(p,m,.1096,.8071).value).toBeCloseTo(value,10);
 const weighted=normalizeMdlInput(fromRows([[0,2],[4,0]]));expect([...weighted.values]).toEqual([0,.5,1,0]);expect([...normalizeMdlInput(fromRows([[0,0],[0,0]])).values]).toEqual([0,0,0,0]);
});
it('fixed slots, both encodings, subset/duplicate/empty rows, all-unassigned and idempotent repair',()=>{
 const p=normalizeMdlInput(fromRows(modules)),rows=new Uint8Array([1,1,0,0,1,1,0,0,1,0,0,0,0,0,0,0]);
 for(const packing of ['horizontal','vertical']as const){const bits=encodeBits(rows,4,4,packing);expect(decodeBits(bits,4,4,packing)).toEqual(rows);const a=legalizeBits(bits,p,4,packing,mulberry32(0));expect(a.membership.every(x=>x===0)).toBe(true);let calls=0;const b=legalizeBits(a.bits,p,4,packing,()=>{calls++;return .5;});expect(b.bits).toEqual(a.bits);expect(calls).toBe(0);}
 const zero=legalizeBits(new Uint8Array(16),p,4,'horizontal',mulberry32(0));expect(zero.membership).toEqual([0,0,0,0]);
});
it('50 random illegal chromosomes legalize into exclusive membership without mutating inputs',()=>{
 fc.assert(fc.property(fc.array(fc.integer({min:0,max:1}),{minLength:20,maxLength:20}),v=>{const bits=Uint8Array.from(v),saved=bits.slice(),p=normalizeMdlInput(fromRows(Array.from({length:5},(_,i)=>Array.from({length:5},(_,j)=>i===j?0:(i+j)%3))));const a=legalizeBits(bits,p,4,'vertical',mulberry32(9));expect(a.membership).toHaveLength(5);const rows=decodeBits(a.bits,5,4,'vertical');for(let i=0;i<5;i++)expect([0,1,2,3].reduce((sum,g)=>sum+rows[g*5+i]!,0)).toBe(1);expect(bits).toEqual(saved);}),{numRuns:50,seed:20261119});
});
it('sigma scaling minimizes and SUS uses strict cumulative boundaries',()=>{expect(sigmaFitness([3,3,3])).toEqual([1,1,1]);const f=sigmaFitness([1,2,3]);expect(f[0]).toBeGreaterThan(f[1]!);expect(f[1]).toBeGreaterThan(f[2]!);expect(sus([0,1,1,0],()=>0)).toEqual([1,1,2,2]);});
it('spec 8.6 fixes crossover -> mutate/evaluate child1 -> mutate/evaluate child2 including repair RNG',async()=>{
 const events:string[]=[],values=[.1,.9, .0001,.9, .5, .9,.0001, .5];let index=0;
 const result=await evaluatePair([new Uint8Array([0,0]),new Uint8Array([1,1])],()=>{events.push('rng');return values[index++]!;},async bits=>{events.push('eval'+(index===4?'1':'2'));index++;events.push('repair-rng');return [...bits];},()=>true);
 expect(result).toEqual([[0,0],[0,0]]);expect(events).toEqual(['rng','rng','rng','rng','eval1','repair-rng','rng','rng','eval2','repair-rng']);expect(index).toBe(8);
});
it.each([PLUS_ID,GIGTA_ID])('%s repeats same seed / preserves source / returns archive no worse than initial',async id=>{
 const input=source(modules),saved=input.values.slice(),p={seed:0,clusterSlots:3,populationSize:4,generations:3,maxProposals:1000};const a=await runAnalysis(input,id,p),b=await runAnalysis(input,id,p);expect(a.membership).toEqual(b.membership);expect(a.objective).toEqual(b.objective);expect(a.trace).toEqual(b.trace);expect(a.objective!.value).toBeLessThanOrEqual(a.trace!['initialObjective']!);expect(input.values).toEqual(saved);
 if(id===PLUS_ID)expect(a.objective!.value).toBe(2*a.metrics['coordinationCost']!);
});
it('purpose/coefficients are comparison conditions; bounds reject without clamping',async()=>{
 const input=source(modules),a=await runAnalysis(input,GIGTA_ID,{clusterSlots:2,populationSize:4,generations:0}),b=await runAnalysis(input,GIGTA_ID,{clusterSlots:2,populationSize:4,generations:0,mdlBeta:.7});expect(comparisonKey(a)).not.toBe(comparisonKey(b));
 for(const p of [{},{clusterSlots:5},{clusterSlots:2,populationSize:3},{clusterSlots:2,maxEvaluations:1},{clusterSlots:2,mdlAlpha:1,mdlBeta:1}])await expect(runAnalysis(input,GIGTA_ID,p)).rejects.toThrow();
 await expect(runAnalysis(source(Array.from({length:100},()=>Array(100).fill(0))),GIGTA_ID,{clusterSlots:83})).rejects.toThrow('8192');await expect(runAnalysis(input,PLUS_ID,{secondBidDenominator:0})).rejects.toThrow();
});
it('budgets differ from ITC/generation completion; n=1 and zero inputs terminate',async()=>{
 expect((await runAnalysis(source([[0]]),GIGTA_ID,{clusterSlots:1})).evaluations).toBe(1);
 const zero=await runAnalysis(source(modules.map(r=>r.map(()=>0))),PLUS_ID,{});expect(zero.iterations).toBe(4);expect(zero.stopReason).toBe('itc-exhausted');
 const partial=await runAnalysis(source(modules),GIGTA_ID,{clusterSlots:2,populationSize:4,generations:3,maxEvaluations:5});expect(partial.stopReason).toBe('evaluation-budget');expect(partial.evaluations).toBe(5);expect(isRankable(partial)).toBe(false);
 const plus=await runAnalysis(source(modules),PLUS_ID,{maxProposals:1});expect(plus.status).toBe('limit-reached');
});
it.each([PLUS_ID,GIGTA_ID])('%s normal / budget / initial-interrupt / mid-search JSON prefix replay and tamper rejection',async id=>{
 const preview=await importFile(new TextEncoder().encode(',A,B,C,D\nA,0,1,0,0\nB,1,0,0,0\nC,0,0,0,1\nD,0,0,1,0').buffer,'igta.csv',defaultOptions,1);
 for(const phase of ['complete','budget','initial','search']){let stop=false;const p={seed:1,clusterSlots:3,populationSize:4,generations:3,maxEvaluations:phase==='budget'?5:16,maxProposals:phase==='budget'?1:1000};const a=await runAnalysis(preview.matrix!,id,p,{},'r',phase==='initial'||phase==='search'?{checkpoint:async progress=>{if(phase==='initial'||(id===PLUS_ID?progress.iterations>=2:progress.evaluations>=5))stop=true;},shouldStop:()=>stop?'cancelled':undefined}:undefined);
 const session:SessionData={schemaVersion:1,kind:'dsm-session',title:'profile',metadata:{createdAt:'2026-11-19T00:00:00Z',timeZone:'Asia/Tokyo',appVersion:'0.4.0',appCommit:'test',userAgent:'test'},input:preview.matrix!,source:preview.source,runs:[a],views:{r:initialView(a.order)},selectedRunId:'r',settings:{algorithmId:id,parameters:a.parameters,options:a.options,color:{log:false,alternative:false},seed:a.seed!}};
 const loaded=await parseSession(new TextEncoder().encode(serializeSession(session)).buffer);expect(loaded.runs[0]!.objective).toEqual(a.objective);expect(loaded.runs[0]!.status).toBe(a.status);const tampered=JSON.parse(serializeSession(session));tampered.runs[0].objective.value++;await expect(parseSession(new TextEncoder().encode(JSON.stringify(tampered)).buffer)).rejects.toThrow('objective');
 }
});
it.each([PLUS_ID,GIGTA_ID])('%s 30 asymmetric weighted inputs preserve archive, exclusivity and objective consistency',async id=>{
 await fc.assert(fc.asyncProperty(fc.array(fc.integer({min:0,max:15}),{minLength:36,maxLength:36}),async v=>{const input=source(Array.from({length:6},(_,i)=>v.slice(i*6,(i+1)*6).map((x,j)=>i===j?0:x/8))),a=await runAnalysis(input,id,{seed:42,clusterSlots:3,populationSize:4,generations:3,maxProposals:100});expect(a.membership).toHaveLength(6);expect(a.objective!.value).toBeLessThanOrEqual(a.trace!['initialObjective']!);const d={n:input.n,values:input.values};if(id===PLUS_ID)expect(a.objective!.value).toBe(2*structureMetrics(preprocess(input).symmetric,a.membership!).coordinationCost);else{const normalized=normalizeMdlInput(d),sizes=[...new Set(a.membership)].map(g=>a.membership!.filter(x=>x===g).length);let internal=0,external=0;for(let i=0;i<6;i++)for(let j=0;j<6;j++)if(i!==j){if(a.membership![i]===a.membership![j])internal+=normalized.values[i*6+j]!;else external+=normalized.values[i*6+j]!;}const missing=sizes.reduce((sum,size)=>sum+size*(size-1),0)-internal,model=(sizes.length+6-Math.max(...sizes))*Math.log2(6);expect(a.objective!.value).toBeCloseTo(.0833*model+(.1096*missing+.8071*external)*2*Math.log2(6),8);}}),{numRuns:30,seed:20261119});
});
it('seed 0 fixes interleaved child evaluations and repair RNG consumption',async()=>{
 const random=mulberry32(0),observed:number[][]=[];await evaluatePair([new Uint8Array([0,0]),new Uint8Array([1,1])],random,async bits=>{observed.push([...bits,random()]);return 0;},()=>true);
 expect(observed).toEqual([[1,1,0.46732782293111086],[0,0,0.6489853798411787]]);
});
it('fixed numerical policy rejects bid overflow/underflow and resource limits instead of shrinking',async()=>{
 expect(()=>normalizeMdlInput(fromRows([[0,1e-300],[1e300,0]]))).toThrow();expect(()=>bidValue(1e100,1)).toThrow();expect(()=>bidValue(1e-100,1)).toThrow();
 const input=source(modules);for(const p of [{clusterSlots:2,populationSize:74},{clusterSlots:2,generations:201},{clusterSlots:2,maxEvaluations:14473}])await expect(runAnalysis(input,GIGTA_ID,p)).rejects.toThrow();
 await expect(runAnalysis(input,PLUS_ID,{costExponent:4})).rejects.toThrow();
});
it('generic-GA settings cannot silently override the reference profile',async()=>{
 for(const extra of [{mutationRate:1},{crossoverRate:.8},{eliteCount:2},{tournamentSize:3}])await expect(runAnalysis(source(modules),GIGTA_ID,{clusterSlots:2,...extra})).rejects.toThrow();
});
it('P13 Figure 5 / equations 12: remove E before bidding; retain surviving slots',()=>{
 const rows=Array.from({length:8},()=>Array<number>(8).fill(0));for(const [a,b]of [[0,4],[2,4],[4,1],[4,7],[5,4]])rows[a!]![b!]=1;
 const p=normalizeMdlInput(fromRows(rows)),bits=new Uint8Array([1,1,1,1,1,0,0,0, 0,0,0,0,1,1,1,1]);const result=legalizeBits(bits,p,2,'horizontal',mulberry32(0));expect(result.membership).toEqual([0,0,0,0,0,1,1,1]);
 const sparse=new Uint8Array([0,0,0,0, 0,0,0,0, 1,1,1,1]);expect(legalizeBits(sparse,normalizeMdlInput(fromRows(modules)),3,'horizontal',mulberry32(0)).bits).toEqual(sparse);
});
