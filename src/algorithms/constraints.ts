import { DomainError } from '../domain';
export interface ClusterConstraints { mustLink: number[][]; cannotLink: number[][]; minClusters: number; maxClusters: number; maxClusterSize: number }
export const CONSTRAINT_CAPABILITIES = ['must-link','cannot-link','cluster-count','max-cluster-size'];
export function normalizeConstraints(n: number, value: unknown): ClusterConstraints | undefined {
  if(value===undefined)return undefined;
  if(!value||typeof value!=='object'||Array.isArray(value))throw new DomainError('INVALID_CONSTRAINTS','制約はオブジェクトが必要です。');
  const raw=value as Record<string,unknown>;
  if(Object.keys(raw).some(k=>!['mustLink','cannotLink','minClusters','maxClusters','maxClusterSize'].includes(k)))throw new DomainError('INVALID_CONSTRAINTS','未知の制約です。');
  const pairs=(v:unknown):number[][]=>{if(v===undefined)return [];if(!Array.isArray(v)||v.length>10000)throw new DomainError('INVALID_CONSTRAINTS','制約ペアは10000件までです。');const keys=new Set<string>();for(const pair of v){if(!Array.isArray(pair)||pair.length!==2||pair.some(x=>!Number.isInteger(x)||x<0||x>=n))throw new DomainError('INVALID_CONSTRAINTS','制約は元indexの有効なペアが必要です。');keys.add([...pair].sort((a,b)=>a-b).join(','));}return [...keys].map(k=>k.split(',').map(Number)).sort((a,b)=>a[0]!-b[0]!||a[1]!-b[1]!);};
  const bound=(v:unknown,fallback:number)=>{if(v===undefined)return fallback;if(typeof v!=='number'||!Number.isInteger(v)||v<1||v>n)throw new DomainError('INVALID_CONSTRAINTS','制約の規模・群数は1〜要素数が必要です。');return v;};
  const c={mustLink:pairs(raw['mustLink']),cannotLink:pairs(raw['cannotLink']),minClusters:bound(raw['minClusters'],1),maxClusters:bound(raw['maxClusters'],n),maxClusterSize:bound(raw['maxClusterSize'],n)};
  constraintUnits(n,c);
  return !c.mustLink.length&&!c.cannotLink.length&&c.minClusters===1&&c.maxClusters===n&&c.maxClusterSize===n?undefined:c;
}
export function constraintUnits(n:number,c?:ClusterConstraints):number[][] {
  const parent=Array.from({length:n},(_,i)=>i),root=(x:number):number=>{while(parent[x]!==x){parent[x]=parent[parent[x]!]!;x=parent[x]!;}return x;};
  for(const [a,b]of c?.mustLink??[]){const x=root(a!),y=root(b!);parent[Math.max(x,y)]=Math.min(x,y);}
  const groups=new Map<number,number[]>();for(let i=0;i<n;i++){const r=root(i);groups.set(r,[...(groups.get(r)??[]),i]);}const units=[...groups.values()];
  if(c&&(c.minClusters>c.maxClusters||c.minClusters>units.length||units.some(g=>g.length>c.maxClusterSize)||Math.ceil(n/c.maxClusterSize)>c.maxClusters||c.cannotLink.some(([a,b])=>root(a!)===root(b!))||c.maxClusters===1&&c.cannotLink.length))throw new DomainError('CONTRADICTORY_CONSTRAINTS','制約が矛盾しています（must-link、cannot-link、群数または最大規模）。');
  return units;
}
export function satisfiesConstraints(m:readonly number[],c?:ClusterConstraints):boolean {
  if(!c)return true;const sizes=new Map<number,number>();for(const g of m)sizes.set(g,(sizes.get(g)??0)+1);
  return sizes.size>=c.minClusters&&sizes.size<=c.maxClusters&&[...sizes.values()].every(s=>s<=c.maxClusterSize)&&c.mustLink.every(([a,b])=>m[a!]===m[b!])&&c.cannotLink.every(([a,b])=>m[a!]!==m[b!]);
}
