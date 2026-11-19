import {readFileSync} from 'node:fs';
import {expect,it} from 'vitest';
import {runAnalysis} from '../../src/algorithms/registry';
import {createMatrixData} from '../../src/domain';
import {provenance} from '../helpers';
// Captured from 9b72a7e before adding observational histories; elapsed time excluded.
const cases=JSON.parse(readFileSync(new URL('../fixtures/history-baseline.json',import.meta.url),'utf8')) as {id:string;seed:number;result:unknown}[];
const input=createMatrixData(Array.from({length:8},(_,i)=>Array.from({length:8},(_,j)=>i===j?0:(i*7+j*11)%13/4)),{convention:'row-depends-on-column',provenance});
it.each(cases)('$id seed=$seed preserves the pre-instrumentation result',async ({id,seed,result})=>{
 const p={...(id==='mcl-exclusive-v1'?{}:{seed}),clusterSlots:3,populationSize:4,generations:4,maxProposals:1000,maxIterations:10},after=await runAnalysis(input,id,p);
 expect(JSON.parse(JSON.stringify({order:after.order,membership:after.membership,objective:after.objective,trace:after.trace,iterations:after.iterations,evaluations:after.evaluations,status:after.status,stopReason:after.stopReason,metrics:after.metrics}))).toEqual(result);expect(after.history).toBeDefined();
});
