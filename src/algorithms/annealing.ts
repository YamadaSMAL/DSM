import { assertMatrix, assertZeroDiagonal, finiteResult, identityOrder, processMetrics, structureMetrics, type DenseMatrix } from '../domain';
import { partitionProcess } from './process';
import { buildHierarchy, cutHierarchy, immediateContext, type ComputeContext } from './hierarchical';
import { mulberry32 } from './random';
export interface AnnealingOptions {alpha:number;maxProposals:number;maxEvaluations:number;coolingInterval:number;coolingRate:number;temperatureFloor:number;temperatureSamples:number;initialization:'separate'|'hierarchical';k:number}
export type StopReason='proposal-budget'|'evaluation-budget'|'temperature-floor'|'trivial'|'converged'|'iteration-limit'|'cancelled'|'time-limit';
export interface AnnealingTrace extends Record<string,number> {initialTemperature:number;finalTemperature:number;calibrationEvaluations:number;calibrationAttempts:number;initialObjective:number;initialSecondary:number;bestObjective:number;bestSecondary:number}
export interface SearchResult {order:number[];membership?:number[];scc?:ReturnType<typeof partitionProcess>;iterations:number;evaluations:number;status:'completed'|'limit-reached'|'cancelled';stopReason:StopReason;initialState:{order:number[];membership?:number[]};trace:AnnealingTrace}
export function normalizeMembership(membership:readonly number[]):{membership:number[];order:number[]}{const groups=new Map<number,number[]>();membership.forEach((c,i)=>{const group=groups.get(c)??[];group.push(i);groups.set(c,group);});const sorted=[...groups.values()].sort((a,b)=>a[0]!-b[0]!),normalized=new Array<number>(membership.length);sorted.forEach((group,c)=>group.forEach(i=>{normalized[i]=c;}));return{membership:normalized,order:sorted.flat()};}
export function metropolis(delta:number,temperature:number,random:()=>number):boolean{return delta<=0||random()<Math.exp(-delta/temperature);}
export interface ClusterState {membership:number[];sizes:number[];internal:Float64Array;score:number}
export function clusterState(s:DenseMatrix,membership:readonly number[],alpha:number):ClusterState{
  const score=structureMetrics(s,membership,alpha).coordinationCost,sizes=new Array<number>(s.n).fill(0),internal=new Float64Array(s.n);
  membership.forEach(c=>{sizes[c]=sizes[c]!+1;});for(let i=0;i<s.n;i++)for(let j=i+1;j<s.n;j++)if(membership[i]===membership[j])internal[membership[i]!]=finiteResult(internal[membership[i]!]!+s.values[i*s.n+j]!);
  return{membership:[...membership],sizes,internal,score};
}
export interface ClusterMove {element:number;from:number;to:number;internalFrom:number;internalTo:number;delta:number}
/** O(n) exact changed-group expression; full domain metric remains authoritative. */
export function clusterMove(s:DenseMatrix,state:ClusterState,element:number,to:number,alpha:number):ClusterMove{
  const from=state.membership[element]!;let a=0,b=0;for(let j=0;j<s.n;j++)if(j!==element){if(state.membership[j]===from)a=finiteResult(a+s.values[element*s.n+j]!);else if(state.membership[j]===to)b=finiteResult(b+s.values[element*s.n+j]!);}
  const sa=state.sizes[from]!,sb=state.sizes[to]!,wa=sa<=2?0:Math.max(0,state.internal[from]!-a),wb=finiteResult(state.internal[to]!+b);
  const delta=finiteResult(finiteResult((sa-1)**alpha*wa-sa**alpha*state.internal[from]!)+finiteResult((sb+1)**alpha*wb-sb**alpha*state.internal[to]!)+finiteResult(s.n**alpha*(a-b)));
  return{element,from,to,internalFrom:wa,internalTo:wb,delta};
}
export function applyClusterMove(state:ClusterState,move:ClusterMove):void{state.membership[move.element]=move.to;state.sizes[move.from]=state.sizes[move.from]!-1;state.sizes[move.to]=state.sizes[move.to]!+1;state.internal[move.from]=move.internalFrom;state.internal[move.to]=move.internalTo;state.score=finiteResult(state.score+move.delta);}
export function sequenceDelta(d:DenseMatrix,order:readonly number[],first:number,second:number):{weight:number;count:number}{
  const p=Math.min(first,second),q=Math.max(first,second),a=order[p]!,b=order[q]!,n=d.n,v=d.values;
  if(p===q)return{weight:0,count:0};let weight=v[b*n+a]!-v[a*n+b]!,count=Number(v[b*n+a]!>0)-Number(v[a*n+b]!>0);
  for(let k=p+1;k<q;k++){const x=order[k]!,before1=v[a*n+x]!,before2=v[x*n+b]!,after1=v[b*n+x]!,after2=v[x*n+a]!;weight=finiteResult(weight+after1-before1+after2-before2);count+=Number(after1>0)+Number(after2>0)-Number(before1>0)-Number(before2>0);}
  return{weight:finiteResult(weight),count};
}
interface Neighbor {delta:number;secondary:number;apply():void}
interface Engine {score():number;secondary():number;propose():Neighbor|null;capture():number[];rebase():void}
async function search(engine:Engine,p:AnnealingOptions,random:()=>number,context:ComputeContext,trivial:boolean){
  let iterations=0,evaluations=1,calibration=0,attempts=0;const positives:number[]=[],initial=engine.score(),initialSecondary=engine.secondary();
  let best=engine.capture(),bestScore=initial,bestSecondary=initialSecondary,temperature=1,reason:StopReason='trivial';
  const replay=context.replay,calibrationBudget=p.maxEvaluations,calibrationAttempts=replay?.iterations===0?(replay.calibrationAttempts??10000):10000;
  if(!trivial)while(calibration<p.temperatureSamples&&evaluations<calibrationBudget&&attempts<calibrationAttempts){
    attempts++;const neighbor=engine.propose();if(neighbor){evaluations++;calibration++;if(neighbor.delta>0)positives.push(neighbor.delta);}
    await context.checkpoint({iterations:0,evaluations,phase:'初期温度の調査',bestValue:bestScore,bestCount:bestSecondary});if(context.shouldStop?.())break;
  }
  if(positives.length){positives.sort((a,b)=>a-b);const mid=Math.floor(positives.length/2),median=positives.length%2?positives[mid]!:positives[mid-1]!/2+positives[mid]!/2;temperature=finiteResult(median/-Math.log(.8));}
  const initialTemperature=temperature;
  if(!trivial)while(true){
    const stopped=context.shouldStop?.();if(stopped){reason=stopped;break;}
    if(replay&&iterations>=replay.iterations){reason='proposal-budget';break;}
    if(iterations>=p.maxProposals){reason='proposal-budget';break;}
    if(evaluations>=p.maxEvaluations){reason='evaluation-budget';break;}
    if(temperature<p.temperatureFloor){reason='temperature-floor';break;}
    iterations++;const neighbor=engine.propose();
    if(neighbor){evaluations++;if(metropolis(neighbor.delta,temperature,random))neighbor.apply();}
    if(iterations%1000===0)engine.rebase();
    if(engine.score()<bestScore||engine.score()===bestScore&&engine.secondary()<bestSecondary){best=engine.capture();bestScore=engine.score();bestSecondary=engine.secondary();}
    if(iterations%p.coolingInterval===0)temperature*=p.coolingRate;
    if(iterations%64===0)await context.checkpoint({iterations,evaluations,phase:'焼きなまし探索',bestValue:bestScore,bestCount:bestSecondary,temperature});
  }
  const stop=context.shouldStop?.();if(stop)reason=stop;
  return{best,iterations,evaluations,status:reason==='cancelled'?'cancelled' as const:reason==='time-limit'?'limit-reached' as const:'completed' as const,stopReason:reason,trace:{initialTemperature,finalTemperature:temperature,calibrationEvaluations:calibration,calibrationAttempts:attempts,initialObjective:initial,initialSecondary,bestObjective:bestScore,bestSecondary}};
}
export async function annealClusters(s:DenseMatrix,p:AnnealingOptions,seed:number,context:ComputeContext=immediateContext):Promise<SearchResult>{
  assertMatrix(s);assertZeroDiagonal(s);const random=mulberry32(seed);
  const initial=p.initialization==='hierarchical'?cutHierarchy(await buildHierarchy(s,context),p.k):{membership:identityOrder(s.n),order:identityOrder(s.n)};
  let state=clusterState(s,initial.membership,p.alpha);
  const engine:Engine={score:()=>state.score,secondary:()=>0,capture:()=>[...state.membership],rebase:()=>{state=clusterState(s,state.membership,p.alpha);},propose:()=>{
    const element=Math.floor(random()*s.n),from=state.membership[element]!;let groups=0;for(const size of state.sizes)if(size>0)groups++;
    let selected=Math.floor(random()*groups),to=-1;for(let c=0;c<s.n;c++)if(state.sizes[c]!>0&&c!==from){if(selected===0){to=c;break;}selected--;}

    if(to===-1){if(state.sizes[from]===1)return null;to=state.sizes.indexOf(0);}
    const move=clusterMove(s,state,element,to,p.alpha);return{delta:move.delta,secondary:0,apply:()=>applyClusterMove(state,move)};
  }};
  const result=await search(engine,p,random,context,s.n===1);let normalized=normalizeMembership(result.best),score=structureMetrics(s,normalized.membership,p.alpha).coordinationCost;
  if(score>result.trace.initialObjective){normalized=normalizeMembership(initial.membership);score=result.trace.initialObjective;}
  return{...result,...normalized,initialState:initial,trace:{...result.trace,bestObjective:score}};
}
export async function annealSequence(d:DenseMatrix,p:AnnealingOptions,seed:number,context:ComputeContext=immediateContext):Promise<SearchResult>{
  const scc=partitionProcess(d),initial=[...scc.order],order=[...initial],position=new Map(order.map((i,p)=>[i,p])),groups=scc.components.filter(c=>c.length>1).map(c=>c.map(i=>position.get(i)!).sort((a,b)=>a-b)),total=groups.reduce((a,b)=>a+b.length,0),random=mulberry32(seed);
  let metric=processMetrics(d,order),score=metric.feedbackWeight,count=metric.feedbackCount;
  const engine:Engine={score:()=>score,secondary:()=>count,capture:()=>[...order],rebase:()=>{metric=processMetrics(d,order);score=metric.feedbackWeight;count=metric.feedbackCount;},propose:()=>{
    let chosen=Math.floor(random()*total),group=groups[0]!;for(const candidate of groups){if(chosen<candidate.length){group=candidate;break;}chosen-=candidate.length;}
    const a=Math.floor(random()*group.length);let b=Math.floor(random()*(group.length-1));if(b>=a)b++;const first=group[a]!,second=group[b]!,delta=sequenceDelta(d,order,first,second);
    return{delta:delta.weight,secondary:delta.count,apply:()=>{[order[first],order[second]]=[order[second]!,order[first]!];score=finiteResult(score+delta.weight);count+=delta.count;}};
  }};
  const result=await search(engine,p,random,context,total===0);let best=result.best,final=processMetrics(d,best);
  if(final.feedbackWeight>result.trace.initialObjective||final.feedbackWeight===result.trace.initialObjective&&final.feedbackCount>result.trace.initialSecondary){best=initial;final=processMetrics(d,best);}
  return{...result,order:best,scc,initialState:{order:initial},trace:{...result.trace,bestObjective:final.feedbackWeight,bestSecondary:final.feedbackCount}};
}
