import { assertMatrix, assertPermutation, assertZeroDiagonal, finiteResult, invertOrder, processMetrics, type DenseMatrix } from '../domain';
export interface SccResult {
  components: number[][];
  membership: number[];
  order: number[];
  bandByElement: number[];
  dagEdges: { from: number; to: number }[];
}
class MinHeap {
  private items: number[] = [];
  get length() { return this.items.length; }
  push(value: number) {
    const a = this.items; let i = a.length; a.push(value);
    while (i > 0) { const p = (i - 1) >> 1; if (a[p]! <= value) break; a[i] = a[p]!; i = p; }
    a[i] = value;
  }
  pop(): number {
    const a = this.items, result = a[0]!, last = a.pop()!;
    if (a.length) { let i = 0; while (i * 2 + 1 < a.length) { let c = i * 2 + 1; if (c + 1 < a.length && a[c + 1]! < a[c]!) c++; if (a[c]! >= last) break; a[i] = a[c]!; i = c; } a[i] = last; }
    return result;
  }
}
/** Iterative Tarjan; provider j → receiver i. SCC IDs follow minimum original index. */
export function partitionProcess(directed: DenseMatrix): SccResult {
  assertMatrix(directed); assertZeroDiagonal(directed);
  const { n, values } = directed;
  const edges = Array.from({ length: n }, () => [] as number[]);
  for (let from = 0; from < n; from++) for (let to = 0; to < n; to++) if (from !== to && values[to * n + from]! > 0) edges[from]!.push(to);
  const index = new Array<number>(n).fill(-1), low = new Array<number>(n).fill(0), onStack = new Array<boolean>(n).fill(false);
  const stack: number[] = [], components: number[][] = [];
  let counter = 0;
  function enter(v: number) { index[v] = low[v] = counter++; stack.push(v); onStack[v] = true; }
  for (let root = 0; root < n; root++) {
    if (index[root] !== -1) continue;
    enter(root);
    const frames = [{ v: root, next: 0, parent: -1 }];
    while (frames.length) {
      const frame = frames[frames.length - 1]!, { v } = frame;
      if (frame.next < edges[v]!.length) {
        const w = edges[v]![frame.next++]!;
        if (index[w] === -1) { enter(w); frames.push({ v: w, next: 0, parent: v }); }
        else if (onStack[w]) low[v] = Math.min(low[v]!, index[w]!);
      } else {
        frames.pop();
        if (frame.parent !== -1) low[frame.parent] = Math.min(low[frame.parent]!, low[v]!);
        if (low[v] === index[v]) {
          const group: number[] = []; let w: number;
          do { w = stack.pop()!; onStack[w] = false; group.push(w); } while (w !== v);
          components.push(group.sort((a, b) => a - b));
        }
      }
    }
  }
  components.sort((a, b) => a[0]! - b[0]!);
  const membership = new Array<number>(n);
  components.forEach((group, c) => group.forEach(i => { membership[i] = c; }));
  const successors = components.map(() => new Set<number>()), indegree = components.map(() => 0), bands = components.map(() => 0);
  for (let from = 0; from < n; from++) for (const to of edges[from]!) {
    const a = membership[from]!, b = membership[to]!;
    if (a !== b && !successors[a]!.has(b)) { successors[a]!.add(b); indegree[b] = indegree[b]! + 1; }
  }
  const ready = new MinHeap(); indegree.forEach((d, i) => { if (d === 0) ready.push(i); });
  const order: number[] = [];
  while (ready.length) {
    const c = ready.pop(); order.push(...components[c]!);
    for (const next of successors[c]!) { bands[next] = Math.max(bands[next]!, bands[c]! + 1); indegree[next] = indegree[next]! - 1; if (indegree[next] === 0) ready.push(next); }
  }
  const dagEdges = successors.flatMap((set, from) => [...set].sort((a,b) => a-b).map(to => ({ from, to })));
  return { components, membership, order, bandByElement: membership.map(c => bands[c]!), dagEdges };
}
export function processViewMetrics(directed: DenseMatrix, order: readonly number[], scc: SccResult) {
  assertPermutation(order, directed.n);
  const metrics = processMetrics(directed, order), position = invertOrder(order);
  let interSccFeedbackWeight = 0;
  for (let to = 0; to < directed.n; to++) for (let from = 0; from < directed.n; from++) if (scc.membership[to] !== scc.membership[from] && position[to]! < position[from]!) interSccFeedbackWeight = finiteResult(interSccFeedbackWeight + directed.values[to * directed.n + from]!);
  const seen = new Set<number>(); let last = -1, contiguous = true;
  for (const i of order) { const c = scc.membership[i]!; if (c !== last) { if (seen.has(c)) contiguous = false; seen.add(c); last = c; } }
  return { ...metrics, interSccFeedbackWeight, sccCount: scc.components.length, maxSccSize: Math.max(...scc.components.map(c => c.length)), cyclicBlockCount: scc.components.filter(c => c.length > 1).length, bandCount: Math.max(...scc.bandByElement) + 1, orderGuaranteed: contiguous && interSccFeedbackWeight === 0 };
}
