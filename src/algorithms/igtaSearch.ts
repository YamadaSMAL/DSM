import { identityOrder, type DenseMatrix } from '../domain';
import { immediateContext,type ComputeContext } from './hierarchical';
import { normalizeMembership } from './annealing';
import { mulberry32 } from './random';
import { PROFILE_VERSION,bidValue,choose,shuffle,totalCostEvaluator,normalizeMdlInput,mdlMetric,legalizeBits,sigmaFitness,sus,evaluatePair } from './igtaProfile';
import type { Parameters,Solution } from './types';
const objective=(name:'totalCost'|'mdl',value:number,conditions:Record<string,number|string>)=>({name,value,version:PROFILE_VERSION+'-'+name,conditions});
export async function runIgtaPlus(d:DenseMatrix,p:Parameters,seed:number,context:ComputeContext=immediateContext):Promise<Solution>{
 const random=mulberry32(seed),cost=totalCostEvaluator(d,p.costExponent!),initial=identityOrder(d.n);let current=[...initial],currentCost=cost(current),best=[...current],bestCost=currentCost,untried=identityOrder(d.n),proposals=0,evaluations=1;
 while(d.n>1&&untried.length&&proposals<p.maxProposals!&&!(context.replay&&proposals>=context.replay.iterations)){
  await context.checkpoint({iterations:proposals,evaluations,phase:'IGTA+ 参照プロファイル',bestValue:bestCost});if(context.shouldStop?.())break;
  const index=Math.floor(random()*untried.length),e=untried.splice(index,1)[0]!;proposals++;
  const sizes=Array<number>(d.n).fill(0),weights=Array<number>(d.n).fill(0);for(let j=0;j<d.n;j++){sizes[current[j]!]!++;if(j!==e)weights[current[j]!]!+=d.values[e*d.n+j]!+d.values[j*d.n+e]!;}
  const groups=sizes.flatMap((s,g)=>s?[g]:[]),bids=groups.map(g=>bidValue(weights[g]!,sizes[g]!)),highest=Math.max(...bids);if(highest===0)continue;
  const u1=random(),lower=bids.filter(x=>x<highest),selected=u1<1/p.secondBidDenominator!&&lower.length?Math.max(...lower):highest;
  const destination=choose(groups.filter((_,i)=>bids[i]===selected),random);if(destination===current[e])continue;
  const candidate=[...current];candidate[e]=destination;const candidateCost=cost(candidate);evaluations++;const old=currentCost,u2=random();
  if(candidateCost<currentCost||u2<1/p.acceptDenominator!){current=candidate;currentCost=candidateCost;if(currentCost<bestCost){best=[...current];bestCost=currentCost;}if(currentCost<old)untried=identityOrder(d.n);}
 }
 const stop=context.shouldStop?.(),budget=untried.length>0&&proposals>=p.maxProposals!,reason=stop??(d.n===1?'trivial':budget?'proposal-budget':'itc-exhausted');
 return{...normalizeMembership(best),iterations:proposals,evaluations,status:stop==='cancelled'?'cancelled':stop||budget?'limit-reached':'completed',stopReason:reason,initialState:{order:initial,membership:initial},objective:objective('totalCost',bestCost,{costExponent:p.costExponent!}),trace:{initialObjective:cost(initial),bestObjective:bestCost}};
}
export async function runGigita(d:DenseMatrix,p:Parameters,seed:number,context:ComputeContext=immediateContext):Promise<Solution>{
 const random=mulberry32(seed),normalized=normalizeMdlInput(d),q=p.populationSize!,c=p.clusterSlots!,g=p.generations!,length=d.n*c;
 let evaluations=0,iterations=0,best:ReturnType<typeof score>|undefined;
 function score(bits:Uint8Array){const repaired=legalizeBits(bits,normalized,c,p.packing!,random),metric=mdlMetric(normalized,repaired.membership,p.mdlAlpha!,p.mdlBeta!);evaluations++;const candidate={...repaired,value:metric.value};if(!best||candidate.value<best.value)best=candidate;return candidate;}
 if(d.n===1)return{order:[0],membership:[0],iterations:0,evaluations:1,status:'completed',stopReason:'trivial',initialState:{order:[0],membership:[0]},objective:objective('mdl',0,{mdlAlpha:p.mdlAlpha!,mdlBeta:p.mdlBeta!,normalization:'zero-diagonal-global-max-v1',clusterSlots:c}),trace:{initialObjective:0,bestObjective:0}};
 const population:ReturnType<typeof score>[]=[];
 // Generate every initial chromosome before repairing any, as specified in §8.6.
 const initialBits=Array.from({length:q},()=>Uint8Array.from({length},()=>random()<.5?1:0));
 const limit=Math.min(p.maxEvaluations!,context.replay?.evaluations??Infinity);
 for(const bits of initialBits){if(evaluations>=limit)break;const candidate=score(bits);population.push(candidate);await context.checkpoint({iterations,evaluations,phase:'G-IGTA 初期集団の評価',bestValue:best!.value});if(context.shouldStop?.())break;}
 const initialState=best?normalizeMembership(best.membership):{membership:identityOrder(d.n),order:identityOrder(d.n)},initialObjective=best?.value??0;
 while(best&&population.length===q&&iterations<g&&d.n>1&&evaluations<limit&&!context.shouldStop?.()){
  const parents=shuffle(sus(sigmaFitness(population.map(x=>x.value)),random),random),next:typeof population=[];
  for(let i=0;i<q;i+=2){const children=await evaluatePair([population[parents[i]!]!.bits,population[parents[i+1]!]!.bits],random,async bits=>{const candidate=score(bits);await context.checkpoint({iterations,evaluations,phase:'G-IGTA 子の合法化・MDL評価',bestValue:best!.value});return candidate;},()=>evaluations<limit&&!context.shouldStop?.());next.push(...children);if(next.length< i+2)break;}
  if(next.length!==q)break;population.splice(0,q,...next);iterations++;
 }
 if(!best)throw new Error(context.shouldStop?.()??'初期評価の予算がありません。');
 const stop=context.shouldStop?.(),budget=d.n>1&&iterations<g&&evaluations>=p.maxEvaluations!,reason=stop??(d.n===1?'trivial':budget?'evaluation-budget':'generation-budget');
 return{...normalizeMembership(best.membership),iterations,evaluations,status:stop==='cancelled'?'cancelled':stop||budget?'limit-reached':'completed',stopReason:reason,initialState,objective:objective('mdl',best.value,{mdlAlpha:p.mdlAlpha!,mdlBeta:p.mdlBeta!,normalization:'zero-diagonal-global-max-v1',clusterSlots:c}),trace:{initialObjective,bestObjective:best.value}};
}
