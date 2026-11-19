import { expect,it } from 'vitest';
import { adjustedRand,sizeDistribution } from '../../src/algorithms/diagnostics';
import { historyRecorder } from '../../src/algorithms/history';
import { runAnalysis } from '../../src/algorithms/registry';
import { PLUS_ID,GIGTA_ID } from '../../src/algorithms/igtaProfile';
import { createMatrixData } from '../../src/domain';
import { provenance } from '../helpers';
const source=createMatrixData([[0,5,0,0],[2,0,0,0],[0,0,0,4],[0,0,1,0]],{convention:'row-depends-on-column',provenance});
it('bounded sampling preserves endpoints, deterministic stride and final archive without mutating observations',()=>{
 const a=historyRecorder('totalCost','current'),b=historyRecorder('totalCost','current');
 for(let i=0;i<100001;i++){const p={iteration:i,evaluations:i+1,value:i%19,best:0};a.add(p);b.add(p);p.value=-1;}
 const h=a.finish();expect(h).toEqual(b.finish());expect(h.points.length).toBeLessThanOrEqual(513);expect(h.samples).toBe(100001);expect(h.points[0]!.iteration).toBe(0);expect(h.points.at(-1)!.iteration).toBe(100000);expect(h.points.at(-1)!.value).toBe(100000%19);h.points[0]!.value=-1;expect(a.finish().points[0]!.value).toBe(0);
});
it('ARI is label invariant, detects chance and disagreement, and handles degenerate partitions',()=>{
 expect(adjustedRand([0,0,1,1],[8,8,3,3])).toBe(1);expect(adjustedRand([0,0,1,1],[0,1,0,1])).toBeCloseTo(-.5,14);expect(adjustedRand([0,0,0,0],[0,1,2,3])).toBe(0);expect(adjustedRand([0],[7])).toBe(1);expect(adjustedRand([0,0],[7,7])).toBe(1);expect(()=>adjustedRand([0],[0,1])).toThrow();expect(sizeDistribution([9,9,2,2,2,7])).toEqual([{size:1,clusters:1},{size:2,clusters:1},{size:3,clusters:1}]);
});
it.each([PLUS_ID,GIGTA_ID,'sa-cluster-v1','sa-sequence-v1','ga-cluster-v1','mcl-exclusive-v1'])('%s deterministic history records the correct purpose and archive',async id=>{
 const p={seed:9,clusterSlots:2,populationSize:4,generations:3,maxProposals:500,maxIterations:10};if(id==='mcl-exclusive-v1')delete (p as {seed?:number}).seed;
 const a=await runAnalysis(source,id,p),b=await runAnalysis(source,id,p);expect(a.history).toEqual(b.history);expect(a.membership).toEqual(b.membership);expect(a.order).toEqual(b.order);expect(a.trace).toEqual(b.trace);const h=a.history!;expect(h.points.length).toBeGreaterThan(0);
 if(id==='mcl-exclusive-v1'){expect(h.metric).toBe('matrixDifference');expect(h.points.at(-1)!.value).toBe(a.trace!['maxDifference']);}
 else{expect(h.points.at(-1)!.best).toBeCloseTo(a.objective?.value??a.metrics[id==='sa-sequence-v1'?'feedbackWeight':'coordinationCost']!,8);for(let i=1;i<h.points.length;i++)expect(h.points[i]!.best!).toBeLessThanOrEqual(h.points[i-1]!.best!);}
});
