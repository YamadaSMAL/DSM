import { assertMatrix, assertZeroDiagonal, DomainError, type DenseMatrix } from '../domain';
import { immediateContext, type ComputeContext } from './hierarchical';
import { normalizeMembership } from './annealing';
export function normalizeColumns(values:Float64Array,n:number,prune=0):void{
  for(let col=0;col<n;col++){let max=-1,keep=col;for(let row=0;row<n;row++){const value=values[row*n+col]!;if(!Number.isFinite(value)||value<0)throw new DomainError('INVALID_TRANSITION','MCLの確率行列が非負有限数ではありません。');if(value>max){max=value;keep=row;}}
    let sum=0;for(let row=0;row<n;row++){const index=row*n+col;if(values[index]!<prune&&row!==keep)values[index]=0;sum+=values[index]!;}
    if(sum===0){for(let row=0;row<n;row++)values[row*n+col]=row===col?1:0;}else for(let row=0;row<n;row++)values[row*n+col]=values[row*n+col]!/sum;
  }
}
export function extractExclusive(values:Float64Array,n:number){const attractors=Array.from({length:n},(_,col)=>{let selected=0;for(let row=1;row<n;row++)if(values[row*n+col]!>values[selected*n+col]!)selected=row;return selected;});return normalizeMembership(attractors);}
export async function runMcl(s:DenseMatrix,inflation=2,maxIterations=100,context:ComputeContext=immediateContext){
  assertMatrix(s);assertZeroDiagonal(s);if(s.n>200)throw new DomainError('MCL_LIMIT','密行列MCLの上限は200要素です。');if(!Number.isFinite(inflation)||inflation<1.2||inflation>5||!Number.isInteger(maxIterations)||maxIterations<1||maxIterations>100)throw new DomainError('MCL_PARAMETERS','inflationは1.2〜5、最大反復は1〜100が必要です。');
  const n=s.n;let max=0;for(let i=0;i<n;i++)for(let j=i+1;j<n;j++){if(s.values[i*n+j]!==s.values[j*n+i])throw new DomainError('NOT_SYMMETRIC','MCLには対称Sが必要です。');max=Math.max(max,s.values[i*n+j]!);}
  let current=new Float64Array(n*n);for(let r=0;r<n;r++)for(let c=0;c<n;c++)current[r*n+c]=r===c?1:max?s.values[r*n+c]!/max:0;normalizeColumns(current,n);const initialState=extractExclusive(current,n);
  let iterations=0,stableSteps=0,maxDifference=0,converged=n===1,stopReason='trivial',evaluations=0;
  outer:while(!converged&&iterations<maxIterations){
    if(context.replay&&iterations>=context.replay.iterations){stopReason='iteration-limit';break;}
    const next=new Float64Array(n*n);
    for(let c=0;c<n;c++){
      for(let k=0;k<n;k++){const weight=current[k*n+c]!;if(weight===0)continue;for(let r=0;r<n;r++)next[r*n+c]=next[r*n+c]!+current[r*n+k]!*weight;}
      await context.checkpoint({iterations,evaluations,phase:'MCL expansion（行列積）'});if(context.shouldStop?.()){stopReason=context.shouldStop()!;break outer;}
    }
    for(let i=0;i<next.length;i++)next[i]=next[i]!**inflation;
    normalizeColumns(next,n,1e-8);maxDifference=0;for(let i=0;i<next.length;i++)maxDifference=Math.max(maxDifference,Math.abs(next[i]!-current[i]!));
    stableSteps=maxDifference<1e-6?stableSteps+1:0;current=next;iterations++;evaluations=iterations;converged=stableSteps>=5;stopReason=converged?'converged':'iteration-limit';
    await context.checkpoint({iterations,evaluations,phase:'MCL inflation・収束判定'});if(context.shouldStop?.()&&!converged){stopReason=context.shouldStop()!;break;}
  }
  let columnError=0;for(let c=0;c<n;c++){let sum=0;for(let r=0;r<n;r++)sum+=current[r*n+c]!;columnError=Math.max(columnError,Math.abs(sum-1));}
  return{...extractExclusive(current,n),transition:current,iterations,evaluations,converged,status:converged?'completed' as const:stopReason==='cancelled'?'cancelled' as const:'limit-reached' as const,stopReason,trace:{stableSteps,maxDifference,columnSumMaxError:columnError},initialState};
}
