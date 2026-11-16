import type { RunResult } from './types';
import { compareResults, comparisonKey, isRankable } from './registry';
export function batchStatistics(runs:readonly RunResult[]){
  const groups=new Map<string,RunResult[]>();
  for(const run of runs)if(run.batch){const key=JSON.stringify([run.batch.id,run.algorithm,run.parameters,comparisonKey(run)]),group=groups.get(key)??[];group.push(run);groups.set(key,group);}
  return [...groups.values()].map(group=>{
    const first=group[0]!,successful=group.filter(isRankable).sort(compareResults),field=first.mode==='structure'?'coordinationCost':'feedbackWeight',values=successful.map(r=>r.metrics[field]!).sort((a,b)=>a-b),max=values.at(-1)??0;
    const mean=max?values.reduce((a,b)=>a+b/max,0)/values.length:0,variance=max?values.reduce((a,b)=>a+(b/max-mean)**2,0)/values.length:0;
    const median=values.length?values.length%2?values[Math.floor(values.length/2)]!:values[values.length/2-1]!/2+values[values.length/2]!/2:null;
    return{batch:first.batch!,algorithmId:first.algorithm.id,mode:first.mode,inputHash:first.inputHash,parameters:first.parameters,options:first.options,recorded:group.length,successful:successful.length,best:values[0]??null,median,worst:values.at(-1)??null,standardDeviation:values.length?Math.sqrt(variance)*max:null,bestSeed:successful[0]?.seed,records:group};
  });
}
