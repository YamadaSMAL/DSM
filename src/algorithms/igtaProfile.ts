import { assertMatrix, assertZeroDiagonal, DomainError, finiteResult, type DenseMatrix } from '../domain';
export const PLUS_ID='igta-plus-paper-informed-v1';
export const GIGTA_ID='igta-pp-gigta-paper-informed-v1';
export const isIgtaProfile=(id:string)=>id===PLUS_ID||id===GIGTA_ID;
export const PROFILE_VERSION='igta-reference-1.0';
export type Random=()=>number;
export function choose<T>(items:readonly T[],random:Random):T {if(!items.length)throw new DomainError('EMPTY_CHOICE','候補がありません。');return items[Math.floor(random()*items.length)]!;}
export function shuffle<T>(items:T[],random:Random):T[]{for(let i=items.length-1;i>0;i--){const j=Math.floor(random()*(i+1));[items[i],items[j]]=[items[j]!,items[i]!];}return items;}
export function normalizeMdlInput(d:DenseMatrix):DenseMatrix {assertMatrix(d);assertZeroDiagonal(d);let max=0;for(const x of d.values)max=Math.max(max,x);return{n:d.n,values:Float64Array.from(d.values,x=>{const y=max?x/max:0;if(x>0&&y===0)throw new DomainError('NUMERIC_UNDERFLOW','MDL正規化で正の重みが0になりました。入力重みの範囲を確認してください。');return y;})};}
export function mdlMetric(p:DenseMatrix,m:readonly number[],alpha:number,beta:number){
 const n=p.n,sizes=new Map<number,number>();for(const g of m)sizes.set(g,(sizes.get(g)??0)+1);let s1=0,s2=0;
 for(let i=0;i<n;i++)for(let j=0;j<n;j++)if(i!==j){const x=p.values[i*n+j]!;if(m[i]===m[j])s1+=1-x;else s2+=x;}
 const model=(sizes.size+n-Math.max(...sizes.values()))*Math.log2(n),value=finiteResult((1-(alpha+beta))*model+(alpha*s1+beta*s2)*2*Math.log2(n));
 return{model,s1,s2,value};
}
export function totalCostEvaluator(d:DenseMatrix,power:number){
 const pairs:{i:number;j:number;w:number}[]=[];for(let i=0;i<d.n;i++)for(let j=i+1;j<d.n;j++){const w=finiteResult(d.values[i*d.n+j]!+d.values[j*d.n+i]!);if(w)pairs.push({i,j,w});}
 return(m:readonly number[])=>{const sizes=Array<number>(d.n).fill(0);for(const g of m)sizes[g]!++;let cost=0;for(const {i,j,w}of pairs)cost=finiteResult(cost+finiteResult(w*(m[i]===m[j]?sizes[m[i]!]!:d.n)**power));return cost;};
}
export function bidValue(weight:number,size:number):number{if(weight===0)return 0;const powered=finiteResult(weight**4),value=finiteResult(powered/size);if(value===0)throw new DomainError('NUMERIC_UNDERFLOW','bidが計算可能な数値範囲を下回りました。入力重みの単位を確認してください。');return value;}
/** Fixed slots survive deletion; public partition normalization is separate from chromosomes. */
export function encodeBits(rows:Uint8Array,n:number,c:number,packing:'horizontal'|'vertical'):Uint8Array {if(packing==='horizontal')return rows.slice();const bits=new Uint8Array(rows.length);for(let g=0;g<c;g++)for(let i=0;i<n;i++)bits[i*c+g]=rows[g*n+i]!;return bits;}
export function decodeBits(bits:Uint8Array,n:number,c:number,packing:'horizontal'|'vertical'):Uint8Array {if(packing==='horizontal')return bits.slice();const rows=new Uint8Array(bits.length);for(let g=0;g<c;g++)for(let i=0;i<n;i++)rows[g*n+i]=bits[i*c+g]!;return rows;}
export function legalizeBits(bits:Uint8Array,p:DenseMatrix,c:number,packing:'horizontal'|'vertical',random:Random){
 const n=p.n;if(bits.length!==n*c||bits.some(x=>x!==0&&x!==1))throw new DomainError('INVALID_CHROMOSOME','染色体の長さまたはビットが不正です。');
 const rows=decodeBits(bits,n,c,packing),sizes=Array<number>(c).fill(0);for(let g=0;g<c;g++)for(let i=0;i<n;i++)sizes[g]!+=rows[g*n+i]!;
 const redundant=new Set<number>();
 for(let a=0;a<c;a++)if(sizes[a])for(let b=0;b<c;b++)if(a!==b&&sizes[b]!>=sizes[a]!){let subset=true;for(let i=0;i<n;i++)if(rows[a*n+i]&&!rows[b*n+i]){subset=false;break;}if(subset&&(sizes[b]!>sizes[a]!||b<a)){redundant.add(a);break;}}
 for(const g of redundant){rows.fill(0,g*n,(g+1)*n);sizes[g]=0;}
 const illegal:number[]=[];for(let i=0;i<n;i++){let count=0;for(let g=0;g<c;g++)count+=rows[g*n+i]!;if(count!==1)illegal.push(i);}shuffle(illegal,random);
 for(const e of illegal){for(let g=0;g<c;g++)if(rows[g*n+e]){rows[g*n+e]=0;sizes[g]!--;}
  const candidates=sizes.flatMap((s,g)=>s?[g]:[]);let to:number;
  if(!candidates.length)to=sizes.indexOf(0);else{
   const bids=candidates.map(g=>{let w=0;for(let j=0;j<n;j++)if(rows[g*n+j])w=finiteResult(w+finiteResult(p.values[e*n+j]!+p.values[j*n+e]!));return bidValue(w,sizes[g]!);});
   const best=Math.max(...bids);to=best>0?choose(candidates.filter((_,i)=>bids[i]===best),random):choose(candidates.filter(g=>sizes[g]===Math.max(...candidates.map(x=>sizes[x]!))),random);
  }rows[to*n+e]=1;sizes[to]!++;
 }
 const membership=Array<number>(n).fill(-1);for(let i=0;i<n;i++){let count=0;for(let g=0;g<c;g++)if(rows[g*n+i]){membership[i]=g;count++;}if(count!==1)throw new DomainError('ILLEGAL_REPAIR','合法化が排他所属を生成しませんでした。');}
 return{bits:encodeBits(rows,n,c,packing),membership};
}
export function sigmaFitness(values:readonly number[]):number[]{const max=Math.max(...values);if(!max)return values.map(()=>1);const scaled=values.map(x=>x/max),mean=scaled.reduce((a,b)=>a+b,0)/scaled.length,sd=Math.sqrt(scaled.reduce((a,b)=>a+(b-mean)**2,0)/scaled.length);const fitness=scaled.map(x=>sd?Math.max(0,1+(mean-x)/(2*sd)):1);return fitness.some(x=>!Number.isFinite(x))||!fitness.some(x=>x>0)?values.map(()=>1):fitness;}
export function sus(fitness:readonly number[],random:Random):number[]{const total=fitness.reduce((a,b)=>a+b,0),step=total/fitness.length,start=random()*step;let index=0,sum=fitness[0]!;return fitness.map((_,i)=>{const pointer=start+i*step;while(index<fitness.length-1&&pointer>=sum)sum+=fitness[++index]!;return index;});}
export function crossBits(a:Uint8Array,b:Uint8Array,random:Random):[Uint8Array,Uint8Array]{const x=a.slice(),y=b.slice();for(let i=0;i<a.length;i++)if(random()<.5){x[i]=b[i]!;y[i]=a[i]!;}return[x,y];}
export function mutateBits(bits:Uint8Array,random:Random):Uint8Array {const result=bits.slice();for(let i=0;i<bits.length;i++)if(random()<.00125)result[i]=1-result[i]!;return result;}
/** §8.6: child1 mutate/evaluate (including RNG repair), THEN child2 mutate/evaluate. */
export async function evaluatePair<T>(parents:[Uint8Array,Uint8Array],random:Random,evaluate:(bits:Uint8Array)=>Promise<T>,canEvaluate:()=>boolean):Promise<T[]> {
 const children=crossBits(...parents,random),result:T[]=[];
 for(const child of children){const mutated=mutateBits(child,random);if(!canEvaluate())break;result.push(await evaluate(mutated));}return result;
}
