/** Label-invariant adjusted Rand index. 1 means identical partitions, not good quality. */
export function adjustedRand(a:readonly number[],b:readonly number[]):number {
 if(a.length!==b.length||a.length===0)throw new Error('同じ要素集合の所属が必要です。');
 const rows=new Map<number,number>(),cols=new Map<number,number>(),cells=new Map<string,number>();
 for(let i=0;i<a.length;i++){const x=a[i]!,y=b[i]!,key=JSON.stringify([x,y]);rows.set(x,(rows.get(x)??0)+1);cols.set(y,(cols.get(y)??0)+1);cells.set(key,(cells.get(key)??0)+1);}
 const pairs=(n:number)=>n*(n-1)/2,sum=(values:Iterable<number>)=>[...values].reduce((s,n)=>s+pairs(n),0),total=pairs(a.length);
 if(total===0)return 1;const r=sum(rows.values()),c=sum(cols.values()),joint=sum(cells.values()),expected=r*c/total,denominator=(r+c)/2-expected;
 return denominator===0?1:(joint-expected)/denominator;
}
export function sizeDistribution(membership:readonly number[]):{size:number;clusters:number}[]{
 const sizes=new Map<number,number>(),counts=new Map<number,number>();for(const group of membership)sizes.set(group,(sizes.get(group)??0)+1);
 for(const size of sizes.values())counts.set(size,(counts.get(size)??0)+1);
 return [...counts].sort(([a],[b])=>a-b).map(([size,clusters])=>({size,clusters}));
}
