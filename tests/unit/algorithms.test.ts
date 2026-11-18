import { describe, expect, it } from 'vitest';
import fc from 'fast-check';
import fixtures from '../fixtures/cases.json';
import { createMatrixData, fromRows, identityOrder, permuteMatrix, preprocess, structureMetrics } from '../../src/domain';
import { buildHierarchy, cutHierarchy, defaultK } from '../../src/algorithms/hierarchical';
import { partitionProcess, processViewMetrics } from '../../src/algorithms/process';
import { algorithms, compareResults, comparisonKey, runAnalysis } from '../../src/algorithms/registry';
import { initialView, moveElement, redo, setOrder, undo } from '../../src/state/views';
import { feedbackOracle, provenance } from '../helpers';
const source = (rows: number[][]) => createMatrixData(rows, { convention: 'row-depends-on-column', provenance });
/** Independent Floyd–Warshall reachability, deliberately not DFS/Tarjan. */
function closureGroups(rows: number[][]) {
  const n = rows.length, reachable = Array.from({ length: n }, (_, i) => Array.from({ length: n }, (_, j) => i === j || rows[j]![i]! > 0));
  for (let k = 0; k < n; k++) for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) reachable[i]![j] ||= reachable[i]![k]! && reachable[k]![j]!;
  const groups: number[][] = [], visited = new Set<number>();
  for (let i = 0; i < n; i++) if (!visited.has(i)) { const group = Array.from({ length: n }, (_, j) => j).filter(j => reachable[i]![j] && reachable[j]![i]); groups.push(group); group.forEach(j => visited.add(j)); }
  return groups;
}
/** Recompute every pair's mean from the original leaves, no incremental update. */
function hierarchyOracle(rows: number[][]) {
  let groups = rows.map((_, i) => ({ node: i, leaves: [i] })); const n = rows.length, max = Math.max(...rows.flat());
  const merges: { left: number; right: number; distance: number }[] = [];
  while (groups.length > 1) {
    const pairs = groups.flatMap((a,i) => groups.slice(i+1).map((b,j) => ({ a:i, b:i+j+1, distance: a.leaves.reduce((sum,x) => sum + b.leaves.reduce((s,y) => s + (max === 0 ? 1 : 1-rows[x]![y]!/max),0),0) / (a.leaves.length*b.leaves.length) })));
    const min = Math.min(...pairs.map(p => p.distance)); const pair = pairs.find(p => p.distance <= min+1e-12)!;
    const a = groups[pair.a]!, b = groups[pair.b]!;
    merges.push({ left:a.node, right:b.node, distance:pair.distance });
    groups = [...groups.filter((_,i) => i!==pair.a && i!==pair.b), { node:n+merges.length-1, leaves:[...a.leaves,...b.leaves].sort((x,y) => x-y) }].sort((a,b) => a.leaves[0]!-b.leaves[0]!);
  }
  return merges;
}
describe('SCC / Kahn / Band', () => {
  it.each(fixtures)('$id $name のSCC・Band・元バッファを照合する', fixture => {
    const matrix = fromRows(fixture.rows), saved = matrix.values.slice(), result = partitionProcess(preprocess(matrix).directed);
    expect(result.components).toEqual(fixture.expected.sccs); expect(result.bandByElement).toEqual(fixture.expected.bands); expect(matrix.values).toEqual(saved);
    if (fixture.id !== 'F09' && fixture.expected.order) expect(result.order).toEqual(fixture.expected.order);
    const metrics = processViewMetrics(preprocess(matrix).directed, result.order, result);
    expect(metrics.interSccFeedbackWeight).toBe(0); expect(metrics.orderGuaranteed).toBe(true);
    expect(metrics.feedbackWeight).toBe(feedbackOracle(matrix,result.order));
  });
  it('F09はSCC内元順を保ち、最適順を求めたと誤認しない', () => { const d=fromRows([[0,5],[2,0]]), result=partitionProcess(d); expect(result.order).toEqual([0,1]); expect(processViewMetrics(d,result.order,result).feedbackWeight).toBe(5); });
  it('推移閉包オラクルと200グラフで一致し、全縮約辺と最長先行Bandを満たす', () => {
    fc.assert(fc.property(fc.integer({min:1,max:8}).chain(n => fc.array(fc.integer({min:0,max:3}),{minLength:n*n,maxLength:n*n}).map(a => Array.from({length:n},(_,i) => a.slice(i*n,(i+1)*n).map((v,j) => i===j?0:v)))), rows => {
      const result = partitionProcess(fromRows(rows)); expect(result.components).toEqual(closureGroups(rows));
      expect([...result.order].sort((a,b)=>a-b)).toEqual(identityOrder(rows.length));
      const position = new Map(result.order.map((v,i)=>[v,i]));
      for (const edge of result.dagEdges) for (const a of result.components[edge.from]!) for (const b of result.components[edge.to]!) expect(position.get(a)!).toBeLessThan(position.get(b)!);
      result.components.forEach((group,c) => { const parents=result.dagEdges.filter(e=>e.to===c).map(e=>result.bandByElement[result.components[e.from]![0]!]!); const expected=parents.length?1+Math.max(...parents):0; group.forEach(i=>expect(result.bandByElement[i]).toBe(expected)); });
    }),{numRuns:200,seed:20261116});
  });
  it('500要素の鎖を再帰深度に依存せず処理する', () => { const n=500, values=new Float64Array(n*n); for(let i=1;i<n;i++) values[i*n+i-1]=1; const result=partitionProcess({n,values}); expect(result.components).toHaveLength(n); expect(result.bandByElement[499]).toBe(499); });
  it('重複縮約辺を一つにし、順序崩れとSCC分断を検出する', () => {
    const d=fromRows([[0,1,0,0],[1,0,0,0],[1,1,0,1],[0,0,1,0]]), scc=partitionProcess(d);
    expect(scc.dagEdges).toEqual([{from:0,to:1}]); expect(processViewMetrics(d,[2,3,0,1],scc).orderGuaranteed).toBe(false); expect(processViewMetrics(d,[0,2,1,3],scc).orderGuaranteed).toBe(false);
  });
});
describe('平均連結', () => {
  it('F07 k=2で手計算の所属・調整コストになる', async () => { const s=preprocess(fromRows(fixtures[6]!.rows)).symmetric, tree=await buildHierarchy(s), cut=cutHierarchy(tree,2); expect(cut.membership).toEqual([0,0,1,1]); expect(structureMetrics(s,cut.membership).coordinationCost).toBe(4); expect(tree.merges).toHaveLength(3); });
  it.each(fixtures)('$id の全kで有効な所属・順序を返す', async f => {
    const s=preprocess(fromRows(f.rows)).symmetric, saved=s.values.slice(), tree=await buildHierarchy(s);
    for(let k=1;k<=s.n;k++) { const cut=cutHierarchy(tree,k); expect(new Set(cut.membership).size).toBe(k); expect([...cut.order].sort((a,b)=>a-b)).toEqual(identityOrder(s.n)); expect(cut.order.map(i=>cut.membership[i])).toEqual([...cut.membership].sort((a,b)=>a-b)); }
    expect(s.values).toEqual(saved);
  });
  it('全0・全同重みで辞書順tie-breakを固定する', async () => {
    for (const weight of [0,1]) { const s=fromRows(Array.from({length:4},(_,i)=>Array.from({length:4},(_,j)=>i===j?0:weight))); const tree=await buildHierarchy(s); expect(tree.merges.map(m=>[m.left,m.right])).toEqual([[0,1],[4,2],[5,3]]); }
    expect(defaultK(1)).toBe(1); expect(defaultK(500)).toBe(22);
  });
  it('平均距離の独立オラクルと100行列で一致する', async () => {
    await fc.assert(fc.asyncProperty(fc.integer({min:1,max:7}).chain(n=>fc.array(fc.integer({min:0,max:9}),{minLength:n*n,maxLength:n*n}).map(a=>Array.from({length:n},(_,i)=>Array.from({length:n},(_,j)=>i===j?0:a[Math.min(i,j)*n+Math.max(i,j)]!)))), async rows => {
      const actual=(await buildHierarchy(fromRows(rows))).merges, expected=hierarchyOracle(rows);
      expect(actual.map(m=>[m.left,m.right])).toEqual(expected.map(m=>[m.left,m.right])); actual.forEach((m,i)=>expect(m.distance).toBeCloseTo(expected[i]!.distance,12));
    }),{numRuns:100,seed:20261116});
  });
  it('1e-12以内を真の最小距離に対する辞書順で選択する', async () => {
    const s=fromRows([[0,1-5e-13,1],[1-5e-13,0,0],[1,0,0]]); expect((await buildHierarchy(s)).merges[0]).toMatchObject({left:0,right:1});
    await expect(buildHierarchy(fromRows([[0,1],[0,0]]))).rejects.toThrow('対称');
    expect(()=>cutHierarchy({n:2,merges:[],evaluations:0},0)).toThrow('k');
  });
});
describe('実行契約と比較', () => {
  it('登録手法全てを実行し、基準を最適化手法と区別する', async () => {
    for (const plugin of algorithms) { const result=await runAnalysis(source([[0,0],[1,0]]),plugin.id,plugin.id.startsWith('igta-pp-')?{clusterSlots:2}:{}); expect(result.status).toBe('completed'); expect(result.inputHash).toMatch(/^[a-f0-9]{64}$/); expect(result.metricVersions).not.toEqual({}); }
    expect(algorithms.filter(a=>!a.baseline).map(a=>a.id).sort()).toEqual(['ga-cluster-v1','hierarchical-average-v1','igta-plus-paper-informed-v1','igta-pp-gigta-paper-informed-v1','mcl-exclusive-v1','sa-cluster-v1','sa-sequence-v1','scc-tarjan-kahn-v1','tearing-greedy-v1']);
  });
  it('k変更で併合履歴を再利用し、α変更も再評価する', async () => {
    const cache=new Map(), a=source(fixtures[6]!.rows);
    const x=await runAnalysis(a,'hierarchical-average-v1',{k:2},{},'x',undefined,cache), y=await runAnalysis(a,'hierarchical-average-v1',{k:1},{},'y',undefined,cache);
    expect(x.cacheHit).toBe(false); expect(y.cacheHit).toBe(true); expect(y.evaluations).toBe(0); expect(x.hierarchy).toBe(y.hierarchy); expect(x.metrics['coordinationCost']).toBe(4); expect(y.metrics['coordinationCost']).toBe(8);
    const z=await runAnalysis(a,'baseline-single-v1',{},{}); expect(comparisonKey(x)).toBe(comparisonKey(z)); expect(compareResults(x,z)).toBeLessThan(0);
    const different=await runAnalysis(a,'baseline-single-v1',{alpha:2},{}); expect(()=>compareResults(x,different)).toThrow('条件');
    const process=await runAnalysis(a,'scc-tarjan-kahn-v1',{},{}); expect(()=>compareResults(x,process)).toThrow('条件');
    const threshold=await runAnalysis(a,'hierarchical-average-v1',{k:2},{threshold:1}); expect(()=>compareResults(x,threshold)).toThrow('条件');
  });
  it('不正パラメータと指標overflowを拒否する', async () => {
    const a=source([[0,1],[1,0]]); await expect(runAnalysis(a,'missing',{})).rejects.toThrow(); await expect(runAnalysis(a,'hierarchical-average-v1',{k:0})).rejects.toThrow(); await expect(runAnalysis(a,'baseline-single-v1',{alpha:0})).rejects.toThrow(); await expect(runAnalysis(source([[0,1e308],[1e308,0]]),'baseline-single-v1',{alpha:3})).rejects.toThrow('範囲');
  });
});
it('手動ビューは元解析と元行列を変更せずundo/redoと再編集を行う', () => {
  const matrix=fromRows([[0,0,0],[1,0,0],[0,1,0]]), saved=matrix.values.slice(), order=[0,1,2]; let history=initialView(order);
  history=moveElement(history,0,2); expect(history.order).toEqual([1,2,0]); expect(order).toEqual([0,1,2]);
  expect(permuteMatrix(matrix,history.order).values).toEqual(new Float64Array([0,0,1,1,0,0,0,0,0]));
  const changed=history; history=undo(history); expect(history.order).toEqual(order); history=redo(history); expect(history.order).toEqual(changed.order); history=undo(history); history=setOrder(history,[2,1,0]); expect(history.future).toEqual([]); expect(matrix.values).toEqual(saved);
});
it('階層法はチェックポイントで中断し、未完了の木を返さない', async () => {
  let checkpoints=0; await expect(buildHierarchy(preprocess(fromRows(fixtures[6]!.rows)).symmetric,{ checkpoint:async()=>{ if(++checkpoints===2)throw new Error('cancelled'); }})).rejects.toThrow('cancelled');expect(checkpoints).toBe(2);
});
it('手動置換の200ケースで、行列・元index・独立フィードバック評価が一致する',()=>{
  fc.assert(fc.property(fc.integer({min:1,max:8}).chain(n=>fc.tuple(fc.array(fc.integer({min:0,max:9}),{minLength:n*n,maxLength:n*n}),fc.shuffledSubarray(identityOrder(n),{minLength:n,maxLength:n})).map(([values,order])=>({n,values:new Float64Array(values.map((v,i)=>Math.floor(i/n)===i%n?0:v)),order}))),input=>{
    const d={n:input.n,values:input.values},scc=partitionProcess(d), view=setOrder(initialView(scc.order),input.order);
    const permuted=permuteMatrix(d,view.order);for(let i=0;i<d.n;i++)for(let j=0;j<d.n;j++)expect(permuted.values[i*d.n+j]).toBe(d.values[view.order[i]!*d.n+view.order[j]!]);
    expect(processViewMetrics(d,view.order,scc).feedbackWeight).toBe(feedbackOracle(d,view.order));
  }),{numRuns:200,seed:20261116});
});
