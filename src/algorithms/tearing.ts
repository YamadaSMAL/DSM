import { finiteResult, processMetrics, type DenseMatrix } from '../domain';
import { partitionProcess } from './process';
import { immediateContext, type ComputeContext } from './hierarchical';
import type { Solution, TearingProposal } from './types';
export function virtualMatrix(d:DenseMatrix,edges:TearingProposal['edges']):DenseMatrix {const values=d.values.slice();for(const edge of edges)values[edge.to*d.n+edge.from]=0;return{n:d.n,values};}
export async function proposeTearing(d:DenseMatrix,maxTears:number,context:ComputeContext=immediateContext):Promise<Solution>{
  const original=partitionProcess(d),virtual=virtualMatrix(d,[]),edges:TearingProposal['edges']=[];let scc=original,totalWeight=0,evaluations=1;
  while(scc.components.some(g=>g.length>1)&&edges.length<maxTears&&!(context.replay&&edges.length>=context.replay.iterations)){
    await context.checkpoint({iterations:edges.length,evaluations,phase:'循環内の依存を比較'});if(context.shouldStop?.())break;
    let chosen:TearingProposal['edges'][number]|undefined;
    for(let from=0;from<d.n;from++)for(let to=0;to<d.n;to++){const weight=virtual.values[to*d.n+from]!;if(from!==to&&weight>0&&scc.membership[from]===scc.membership[to]&&(!chosen||weight<chosen.weight))chosen={from,to,weight};}
    if(!chosen)break;edges.push(chosen);totalWeight=finiteResult(totalWeight+chosen.weight);virtual.values[chosen.to*d.n+chosen.from]=0;scc=partitionProcess(virtual);evaluations++;
  }
  const acyclic=scc.components.every(g=>g.length===1),stopped=context.shouldStop?.();
  return{order:scc.order,scc:original,iterations:edges.length,evaluations,status:stopped==='cancelled'?'cancelled':stopped||!acyclic?'limit-reached':'completed',stopReason:stopped??(acyclic?'virtual-dag':'iteration-limit'),tearing:{edges,totalWeight,virtualOrder:scc.order,virtualMetrics:processMetrics(virtual,scc.order),acyclic}};
}
