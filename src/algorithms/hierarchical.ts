import { assertMatrix, assertZeroDiagonal, DomainError, type DenseMatrix } from '../domain';
export interface Merge { id: number; left: number; right: number; distance: number; size: number }
export interface Hierarchy { n: number; merges: Merge[]; evaluations: number }
export interface Progress { iterations: number; evaluations: number; phase: string; bestValue?:number;bestCount?:number;temperature?:number }
export interface ComputeContext { checkpoint(progress: Progress): Promise<void>;shouldStop?:()=> 'cancelled'|'time-limit'|undefined;replay?:{iterations:number;evaluations:number;calibrationAttempts?:number;offspring?:number;status?:'limit-reached'|'cancelled';stopReason?:string} }
export const immediateContext: ComputeContext = { checkpoint: async () => {} };
export const defaultK = (n: number) => Math.min(n, Math.max(2, Math.round(Math.sqrt(n))));

/** Average linkage, O(n³) pair scans / O(n²) storage. Caller buffers are never changed. */
export async function buildHierarchy(symmetric: DenseMatrix, context = immediateContext): Promise<Hierarchy> {
  assertMatrix(symmetric); assertZeroDiagonal(symmetric);
  const { n, values } = symmetric;
  let max = 0;
  for (let i = 0; i < n; i++) for (let j = i + 1; j < n; j++) {
    if (values[i * n + j] !== values[j * n + i]) throw new DomainError('NOT_SYMMETRIC', '階層法には対称化したSが必要です。');
    max = Math.max(max, values[i * n + j]!);
  }
  const distances = new Float64Array(n * n);
  for (let i = 0; i < n; i++) for (let j = i + 1; j < n; j++) distances[i * n + j] = distances[j * n + i] = max === 0 ? 1 : 1 - values[i * n + j]! / max;
  // Slots retain their minimum member. Disjoint sorted member sets compare by their minima.
  const active = Array.from({ length: n }, (_, i) => i);
  const sizes = new Array<number>(n).fill(1), nodes = Array.from({ length: n }, (_, i) => i);
  const merges: Merge[] = [];
  let evaluations = 0;
  while (active.length > 1) {
    let minimum = Infinity;
    for (let a = 0; a < active.length; a++) for (let b = a + 1; b < active.length; b++) {
      minimum = Math.min(minimum, distances[active[a]! * n + active[b]!]!); evaluations++;
    }
    let left = -1, right = -1;
    // Find the lexicographically first pair within tolerance of the true minimum.
    outer: for (let a = 0; a < active.length; a++) for (let b = a + 1; b < active.length; b++) {
      evaluations++;
      if (distances[active[a]! * n + active[b]!]! <= minimum + 1e-12) { left = active[a]!; right = active[b]!; break outer; }
    }
    const size = sizes[left]! + sizes[right]!;
    const id = n + merges.length;
    merges.push({ id, left: nodes[left]!, right: nodes[right]!, distance: distances[left * n + right]!, size });
    for (const other of active) if (other !== left && other !== right) {
      const distance = (sizes[left]! * distances[left * n + other]! + sizes[right]! * distances[right * n + other]!) / size;
      distances[left * n + other] = distances[other * n + left] = distance;
    }
    sizes[left] = size; nodes[left] = id;
    active.splice(active.indexOf(right), 1);
    await context.checkpoint({ iterations: merges.length, evaluations, phase: '平均連結の併合' });
  }
  return { n, merges, evaluations };
}

export function cutHierarchy(tree: Hierarchy, k: number): { membership: number[]; order: number[] } {
  if (!Number.isInteger(k) || k < 1 || k > tree.n) throw new DomainError('INVALID_K', 'kは1〜要素数の整数が必要です。');
  const groups = new Map(Array.from({ length: tree.n }, (_, i) => [i, [i]]));
  for (const merge of tree.merges.slice(0, tree.n - k)) {
    const a = groups.get(merge.left), b = groups.get(merge.right);
    if (!a || !b) throw new DomainError('INVALID_TREE', '併合履歴が不正です。');
    groups.delete(merge.left); groups.delete(merge.right);
    groups.set(merge.id, [...a, ...b].sort((x, y) => x - y));
  }
  if (groups.size !== k) throw new DomainError('INVALID_TREE', '併合履歴の件数が不正です。');
  const sorted = [...groups.values()].sort((a, b) => a[0]! - b[0]!);
  const membership = new Array<number>(tree.n);
  sorted.forEach((group, c) => group.forEach(i => { membership[i] = c; }));
  return { membership, order: sorted.flat() };
}
