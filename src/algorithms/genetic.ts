import { DomainError, finiteResult, assertMatrix, assertZeroDiagonal, identityOrder, structureMetrics, type DenseMatrix } from '../domain';
import { buildHierarchy, cutHierarchy, defaultK, immediateContext, type ComputeContext } from './hierarchical';
import { constraintUnits, satisfiesConstraints } from './constraints';
import { mulberry32 } from './random';
import type { Parameters, Solution } from './types';
/** First occurrence canonicalization, deliberately retains label-alignment effects of uniform crossover. */
export function canonicalGenes(m:readonly number[]):number[]{const labels=new Map<number,number>();return m.map(x=>{if(!labels.has(x))labels.set(x,labels.size);return labels.get(x)!;});}
export function uniformCrossover(a:readonly number[],b:readonly number[],random:()=>number):number[]{const x=canonicalGenes(a),y=canonicalGenes(b);return canonicalGenes(x.map((v,i)=>random()<.5?v:y[i]!));}
export function mutateGenes(m:readonly number[],rate:number,random:()=>number):number[]{let genes=canonicalGenes(m);for(let i=0;i<genes.length;i++)if(random()<rate){const choices=[...new Set(genes)].filter(c=>c!==genes[i]);choices.push(Math.max(...genes)+1);genes[i]=choices[Math.floor(random()*choices.length)]!;genes=canonicalGenes(genes);}return genes;}
export async function runGenetic(s:DenseMatrix,p:Parameters,seed:number,context:ComputeContext=immediateContext):Promise<Solution>{
  const random=mulberry32(seed),c=p.constraints,units=constraintUnits(s.n,c),popSize=p.populationSize!,generations=p.generations!,replay=context.replay;
  assertMatrix(s);assertZeroDiagonal(s);
  const weightedPairs:{a:number;b:number;weight:number}[]=[];
  for(let a=0;a<s.n;a++)for(let b=a+1;b<s.n;b++){if(s.values[a*s.n+b]!==s.values[b*s.n+a])throw new DomainError('NOT_SYMMETRIC','GAには対称Sが必要です。');const weight=s.values[a*s.n+b]!;if(weight)weightedPairs.push({a,b,weight});}
  const conflicts=Array.from({length:s.n},()=>new Set<number>());for(const [a,b]of c?.cannotLink??[]){conflicts[a!]!.add(b!);conflicts[b!]!.add(a!);}
  let evaluations=0,iterations=0,attempts=0,offspringInGeneration=0;
  const objective=(m:number[])=>{const sizes=Array<number>(s.n).fill(0);for(const g of m)sizes[g]!++;let sum=0;for(const {a,b,weight}of weightedPairs)sum=finiteResult(sum+finiteResult(weight*(m[a]===m[b]?sizes[m[a]!]!:s.n)**p.alpha!));return sum;};
  const score=(m:number[])=>{evaluations++;return{m:canonicalGenes(m),value:objective(canonicalGenes(m))};};
  const repair=async(genes:number[]):Promise<number[]|null>=>{
    if(satisfiesConstraints(genes,c))return canonicalGenes(genes);
    for(let attempt=0;attempt<20;attempt++){
      await context.checkpoint({iterations,evaluations,phase:'GA制約の実行可能候補'});if(context.shouldStop?.())return null;
      const membership=Array<number>(s.n).fill(-1),sizes:number[]=[],order=units.map((_,i)=>i);
      for(let i=order.length-1;i>0;i--){const j=Math.floor(random()*(i+1));[order[i],order[j]]=[order[j]!,order[i]!];}
      for(const [unitPosition,u] of order.entries()){const group=units[u]!,preferred=genes[group[0]!]!,options=sizes.map((_,i)=>i);options.sort((a,b)=>Number(b===preferred)-Number(a===preferred));if((c?.minClusters??1)-sizes.length>=order.length-unitPosition)options.unshift(sizes.length);else options.push(sizes.length);
        const to=options.find(g=>g<(c?.maxClusters??s.n)&&(sizes[g]??0)+group.length<=(c?.maxClusterSize??s.n)&&!group.some(i=>[...conflicts[i]!].some(j=>membership[j]===g)));
        if(to===undefined)break;for(const element of group)membership[element]=to;sizes[to]=(sizes[to]??0)+group.length;
      }
      if(membership.every(g=>g>=0)&&satisfiesConstraints(membership,c))return canonicalGenes(membership);
    }
    return null;
  };
  if(s.n===1){const initialState={order:[0],membership:[0]};return{...initialState,iterations:0,evaluations:1,status:'completed',stopReason:'trivial',initialState,trace:{initialObjective:0,bestObjective:0,initializationAttempts:1,offspringInGeneration:0}};}
  const tree=await buildHierarchy(s,{checkpoint:async progress=>{await context.checkpoint({...progress,phase:'GA初期階層解'});if(context.shouldStop?.())throw new Error(context.shouldStop!());}});
  const seeds=[cutHierarchy(tree,defaultK(s.n)).membership,identityOrder(s.n)];
  const population:ReturnType<typeof score>[]=[];
  while(population.length<popSize){
    const proposal=seeds[attempts]??identityOrder(s.n).map(()=>Math.floor(random()*s.n));const m=await repair(proposal);attempts++;if(context.shouldStop?.())throw new Error(context.shouldStop!());
    if(m)population.push(score(m));
    if(attempts%8===0){await context.checkpoint({iterations:0,evaluations,phase:'GAの実行可能初期集団'});if(context.shouldStop?.())throw new Error(context.shouldStop!());}
    if(attempts>=popSize*40)break;
  }
  if(!population.length)throw new DomainError('SEARCH_NO_FEASIBLE','予算内に実行可能解が見つかりませんでした。数学的に実行不能という判定ではありません。');
  while(population.length<popSize)population.push(population[0]!);
  population.sort((a,b)=>a.value-b.value);let best=population[0]!;const initialState={membership:[...best.m],order:identityOrder(s.n).sort((a,b)=>best.m[a]!-best.m[b]!||a-b)},initialObjective=best.value;
  const tournament=()=>{let winner=population[Math.floor(random()*popSize)]!;for(let i=1;i<p.tournamentSize!;i++){const candidate=population[Math.floor(random()*popSize)]!;if(candidate.value<winner.value)winner=candidate;}return winner;};
  let reason='generation-budget';
  // Preserve every evaluated feasible candidate, including an incomplete generation.
  while(iterations<(s.n===1?0:generations)&&!(replay&&iterations>=replay.iterations&&(!replay.offspring||iterations>replay.iterations))){
    if(context.shouldStop?.())break;
    offspringInGeneration=0;const next=population.slice(0,p.eliteCount!);
    while(next.length<popSize){if(replay&&iterations===replay.iterations&&offspringInGeneration>=(replay.offspring??0))break;const a=tournament(),b=tournament(),cross=random()<p.crossoverRate!?uniformCrossover(a.m,b.m,random):[...a.m];const m=await repair(mutateGenes(cross,p.mutationRate!,random));if(context.shouldStop?.())break;const candidate=m?score(m):a;next.push(candidate);offspringInGeneration++;if(candidate.value<best.value)best=candidate;if(next.length%8===0){await context.checkpoint({iterations,evaluations,phase:'GA次世代の生成',bestValue:best.value});if(context.shouldStop?.())break;}}
    if(context.shouldStop?.()||replay&&iterations===replay.iterations&&offspringInGeneration===(replay.offspring??0))break;
    population.splice(0,popSize,...next.sort((a,b)=>a.value-b.value));if(population[0]!.value<best.value)best=population[0]!;iterations++;offspringInGeneration=0;
    await context.checkpoint({iterations,evaluations,phase:'GA世代探索',bestValue:best.value});
  }
  const stopped=context.shouldStop?.();if(stopped)reason=stopped;
  const authoritative=structureMetrics(s,best.m,p.alpha).coordinationCost;if(authoritative!==best.value)throw new DomainError('OBJECTIVE_MISMATCH','GA目的値が共有指標と一致しません。');
  return{membership:[...best.m],order:identityOrder(s.n).sort((a,b)=>best.m[a]!-best.m[b]!||a-b),iterations,evaluations,status:stopped==='cancelled'?'cancelled':stopped?'limit-reached':'completed',stopReason:reason,initialState,trace:{initialObjective,bestObjective:best.value,initializationAttempts:attempts,offspringInGeneration}};
}
