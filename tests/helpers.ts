import type { DenseMatrix, Provenance } from '../src/domain';

export const provenance: Provenance = {
  sourceName: 'test.csv',
  sourceSha256: '0'.repeat(64),
  importOptions: {},
  transformations: [],
};

export function permutations(n: number): number[][] {
  const result: number[][] = [];
  function visit(prefix: number[], remaining: number[]): void {
    if (!remaining.length) result.push(prefix);
    for (const item of remaining) visit([...prefix, item], remaining.filter((i) => i !== item));
  }
  visit([], Array.from({ length: n }, (_, i) => i));
  return result;
}

/** Independent edge-based oracle: earlier receiver than provider implies feedback. */
export function feedbackOracle(matrix: DenseMatrix, order: readonly number[]): number {
  const position = new Map(order.map((element, i) => [element, i]));
  let total = 0;
  matrix.values.forEach((weight, index) => {
    const receiver = Math.floor(index / matrix.n);
    const provider = index % matrix.n;
    if (position.get(receiver)! < position.get(provider)!) total += weight;
  });
  return total;
}
