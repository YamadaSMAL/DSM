import {expect,it} from 'vitest';
import fc from 'fast-check';
import {createMatrixData,preprocess,structureMetrics} from '../../src/domain';
import {provenance} from '../helpers';
import {normalizeConstraints,satisfiesConstraints} from '../../src/algorithms/constraints';
import {canonicalGenes,uniformCrossover,mutateGenes} from '../../src/algorithms/genetic';
import {comparisonKey,compareResults,isRankable,runAnalysis} from '../../src/algorithms/registry';
import {virtualMatrix} from '../../src/algorithms/tearing';
import {partitionProcess} from '../../src/algorithms/process';
import {importFile} from '../../src/io/import';
import {defaultOptions} from '../../src/io/types';
import {parseSession,serializeSession,type SessionData} from '../../src/io/session';
import {initialView} from '../../src/state/views';
import {prepareExport} from '../../src/io/prepareExport';
import {htmlExport} from '../../src/io/htmlExport';
import {xlsxExport} from '../../src/io/xlsxExport';
import {read,utils} from 'xlsx';
const rows=[[0,1,0,0],[1,0,0,0],[0,0,0,1],[0,0,1,0]];
const source=(r:number[][])=>createMatrixData(r,{convention:'row-depends-on-column',provenance});
const p={seed:0,generations:8,populationSize:10};
it('制約の正規化・同値類・重複・既定の同一性を固定する',()=>{
 expect(normalizeConstraints(4,{})).toBeUndefined();expect(normalizeConstraints(4,{mustLink:[[1,0],[0,1]],maxClusters:3})).toEqual({mustLink:[[0,1]],cannotLink:[],minClusters:1,maxClusters:3,maxClusterSize:4});
 for(const c of [{mustLink:[[0,1],[1,2]],cannotLink:[[0,2]]},{cannotLink:[[1,1]]},{mustLink:[[0,1]],maxClusterSize:1},{minClusters:3,maxClusters:2},{maxClusterSize:1,maxClusters:2},{mustLink:[[0,1],[1,2],[2,3]],minClusters:2},{cannotLink:[[0,2]],maxClusters:1}])expect(()=>normalizeConstraints(4,c)).toThrow('矛盾');
 for(const c of [{unexpected:true},{cannotLink:[[4,0]]},{mustLink:'x'},null,{maxClusters:NaN}])expect(()=>normalizeConstraints(4,c)).toThrow();
});
it('初出順の染色体・一様交叉・突然変異を注入乱数で検証する',()=>{
 expect(canonicalGenes([4,9,4,2])).toEqual([0,1,0,2]);let i=0;expect(uniformCrossover([4,4,9,9],[9,3,9,3],()=>[0,.9,.9,0][i++]!)).toEqual([0,1,0,1]);expect(mutateGenes([0,0],0,()=>.5)).toEqual([0,0]);expect(mutateGenes([0,0],1,()=>.99)).toEqual([0,1]);
});
it('GAは同seed同条件で再現し、階層初期解以上を保持して入力を変えない',async()=>{
 const input=source(rows),saved=input.values.slice(),a=await runAnalysis(input,'ga-cluster-v1',p),b=await runAnalysis(input,'ga-cluster-v1',p);
 expect(a.membership).toEqual(b.membership);expect(a.trace).toEqual(b.trace);expect(a.evaluations).toBe(b.evaluations);expect(a.iterations).toBe(8);expect(a.metrics['coordinationCost']).toBeLessThanOrEqual(a.trace!['initialObjective']!);expect(input.values).toEqual(saved);
 const one=await runAnalysis(source([[0]]),'ga-cluster-v1',{});expect(one.iterations).toBe(0);expect(one.evaluations).toBe(1);
});
it('制約付きGAはmust/cannot・群数・規模を守り、異なる制約を比較しない',async()=>{
 const c=normalizeConstraints(4,{mustLink:[[0,1]],cannotLink:[[1,2]],minClusters:2,maxClusters:2,maxClusterSize:2})!;
 const a=await runAnalysis(source(rows),'ga-cluster-v1',{...p,constraints:c}),b=await runAnalysis(source(rows),'ga-cluster-v1',p);expect(satisfiesConstraints(a.membership!,c)).toBe(true);expect(comparisonKey(a)).not.toBe(comparisonKey(b));expect(()=>compareResults(a,b)).toThrow();
 await expect(runAnalysis(source(rows),'hierarchical-average-v1',{k:2,constraints:c})).rejects.toThrow('対応していません');
});
it('未証明の実行可能性は探索不成功と表示し、数学的矛盾と断定しない',async()=>{
 const c=normalizeConstraints(3,{cannotLink:[[0,1],[1,2],[0,2]],maxClusters:2})!;
 await expect(runAnalysis(source([[0,0,0],[0,0,0],[0,0,0]]),'ga-cluster-v1',{...p,populationSize:4,constraints:c})).rejects.toThrow('数学的に実行不能という判定ではありません');
});
it('GAの50ランダム入力で全要素の排他所属と最良保持を確認する',async()=>{
 await fc.assert(fc.asyncProperty(fc.array(fc.integer({min:0,max:5}),{minLength:25,maxLength:25}),async v=>{const a=await runAnalysis(source(Array.from({length:5},(_,i)=>v.slice(i*5,(i+1)*5))),'ga-cluster-v1',{seed:4,populationSize:4,generations:4});expect(a.membership).toHaveLength(5);expect(a.metrics['coordinationCost']).toBeLessThanOrEqual(a.trace!['initialObjective']!);expect(a.metrics['coordinationCost']).toBe(structureMetrics(preprocess(source(Array.from({length:5},(_,i)=>v.slice(i*5,(i+1)*5)))).symmetric,a.membership!).coordinationCost);}),{numRuns:50,seed:20261118});
});
it('Tearingは列→行、最小重み、同点元index順で提案し、元行列を変更しない',async()=>{
 const input=source([[0,5],[2,0]]),saved=input.values.slice(),a=await runAnalysis(input,'tearing-greedy-v1',{});expect(a.tearing!.edges).toEqual([{from:0,to:1,weight:2}]);expect(a.tearing!.totalWeight).toBe(2);expect(a.order).toEqual([1,0]);expect(a.metrics['feedbackWeight']).toBe(2);expect(a.tearing!.virtualMetrics.feedbackWeight).toBe(0);expect(a.tearing!.acyclic).toBe(true);expect(input.values).toEqual(saved);expect(isRankable(a)).toBe(false);
 const tie=await runAnalysis(source([[0,1],[1,0]]),'tearing-greedy-v1',{});expect(tie.tearing!.edges[0]).toEqual({from:0,to:1,weight:1});
});
it('TearingはDAG・零・単要素を変更せず、候補上限と取消を区別する',async()=>{
 for(const r of [[[0]],[[0,0],[1,0]],[[0,0],[0,0]]]){const a=await runAnalysis(source(r),'tearing-greedy-v1',{});expect(a.tearing!.edges).toEqual([]);expect(a.status).toBe('completed');}
 const r=await runAnalysis(source(rows),'tearing-greedy-v1',{maxTears:1});expect(r.status).toBe('limit-reached');expect(r.tearing!.acyclic).toBe(false);
 let stopped=false;const a=await runAnalysis(source(rows),'tearing-greedy-v1',{}, {},'x',{checkpoint:async()=>{stopped=true;},shouldStop:()=>stopped?'cancelled':undefined});expect(a.status).toBe('cancelled');expect(a.tearing!.edges).toEqual([]);
});
it('Tearingの50ランダム行列で候補が循環内にあり、適用後DAGを確認する',async()=>{
 await fc.assert(fc.asyncProperty(fc.array(fc.integer({min:0,max:3}),{minLength:25,maxLength:25}),async v=>{const input=source(Array.from({length:5},(_,i)=>v.slice(i*5,(i+1)*5))),d=preprocess(input).directed,a=await runAnalysis(input,'tearing-greedy-v1',{});let current=d;for(const edge of a.tearing!.edges){const scc=partitionProcess(current);expect(scc.membership[edge.from]).toBe(scc.membership[edge.to]);expect(current.values[edge.to*5+edge.from]).toBe(edge.weight);current=virtualMatrix(current,[edge]);}expect(partitionProcess(current).components.every(g=>g.length===1)).toBe(true);}),{numRuns:50,seed:20261118});
});
it.each(['ga-cluster-v1','tearing-greedy-v1'])('%sの完了と中断prefixを保存再現し、提案改変を拒否する',async id=>{
 const preview=await importFile(new TextEncoder().encode(',A,B,C,D\nA,0,1,0,0\nB,1,0,0,0\nC,0,0,0,1\nD,0,0,1,0').buffer,'x.csv',defaultOptions,1),input=preview.matrix!;
 for(const partial of [false,true]){let stopped=false;const a=await runAnalysis(input,id,id.startsWith('ga')?{...p,constraints:normalizeConstraints(4,{mustLink:[[0,1]]})!}:{},{},'r',partial?{checkpoint:async progress=>{if(id.startsWith('ga')?progress.phase==='GA次世代の生成':progress.iterations>=1)stopped=true;},shouldStop:()=>stopped?'cancelled':undefined}:undefined);
 const s:SessionData={schemaVersion:1,kind:'dsm-session',title:'M6',metadata:{createdAt:'2026-11-18T00:00:00Z',timeZone:'Asia/Tokyo',appVersion:'0.3.0',appCommit:'test',userAgent:'test'},input,source:preview.source,runs:[a],views:{r:initialView(a.order)},selectedRunId:'r',settings:{algorithmId:id,parameters:a.parameters,options:a.options,color:{log:false,alternative:false},...(a.seed!==undefined?{seed:a.seed}:{})}};
 const loaded=await parseSession(new TextEncoder().encode(serializeSession(s)).buffer);expect(loaded.runs[0]!.metrics).toEqual(a.metrics);expect(loaded.runs[0]!.status).toBe(a.status);
 if(id.startsWith('ga')){const tampered=JSON.parse(serializeSession(s));tampered.runs[0].parameters.constraints.mustLink=[[0,2]];await expect(parseSession(new TextEncoder().encode(JSON.stringify(tampered)).buffer)).rejects.toThrow();}
 if(a.tearing){const prepared=await prepareExport(s),html=htmlExport(prepared);expect(html).toContain('仮想D');const book=read(xlsxExport(prepared),{type:'array'});expect(book.SheetNames).toHaveLength(9);expect(JSON.stringify(utils.sheet_to_json(book.Sheets['RunConfig']!))).toContain('tearing');const tampered=JSON.parse(serializeSession(s));tampered.runs[0].tearing.totalWeight++;await expect(parseSession(new TextEncoder().encode(JSON.stringify(tampered)).buffer)).rejects.toThrow('tearing');}
 }
});
it('GAは途中世代で評価した候補と実評価数を保持し、prefixで再現できる',async()=>{
 const input=source(rows);let stopped=false;const a=await runAnalysis(input,'ga-cluster-v1',p,{},'r',{checkpoint:async progress=>{if(progress.phase==='GA次世代の生成')stopped=true;},shouldStop:()=>stopped?'time-limit':undefined});
 expect(a.status).toBe('limit-reached');expect(a.iterations).toBe(0);expect(a.evaluations).toBeGreaterThan(p.populationSize);expect(a.trace!['offspringInGeneration']).toBe(6);
 const b=await runAnalysis(input,'ga-cluster-v1',p,{},'r',{checkpoint:async()=>{},replay:{iterations:a.iterations,evaluations:a.evaluations,offspring:a.trace!['offspringInGeneration']!,status:'limit-reached',stopReason:'time-limit'}});expect(b.membership).toEqual(a.membership);expect(b.evaluations).toBe(a.evaluations);expect(b.trace).toEqual(a.trace);
});
it('GA初期化の取消では未完成の集団から架空の結果を作らない',async()=>{
 let stopped=false;await expect(runAnalysis(source(rows),'ga-cluster-v1',p,{},'r',{checkpoint:async()=>{stopped=true;},shouldStop:()=>stopped?'cancelled':undefined})).rejects.toThrow('cancelled');
});
it('実行可能な制約を作った30ケースでGAの全制約を確認する',async()=>{
 await fc.assert(fc.asyncProperty(fc.integer({min:0,max:1000}),async seed=>{const c=normalizeConstraints(6,{mustLink:[[0,1],[4,5]],cannotLink:[[1,2],[3,4]],minClusters:3,maxClusters:3,maxClusterSize:2})!;const a=await runAnalysis(source(Array.from({length:6},(_,i)=>Array.from({length:6},(_,j)=>i===j?0:(i+j)%3))),'ga-cluster-v1',{seed,populationSize:4,generations:3,constraints:c});expect(satisfiesConstraints(a.membership!,c)).toBe(true);}),{numRuns:30,seed:20261118});
});
it('GAの不正な個体数・世代・確率・エリートをAPIで拒否する',async()=>{
 for(const invalid of [{populationSize:3},{populationSize:101},{generations:0},{generations:501},{crossoverRate:1.1},{mutationRate:-1},{eliteCount:50},{tournamentSize:51}])await expect(runAnalysis(source(rows),'ga-cluster-v1',invalid)).rejects.toThrow();
});
