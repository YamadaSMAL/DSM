import { type DenseMatrix } from './types';
import { assertMatrix, assertSize, DomainError } from './validation';

export function identityOrder(n: number): number[] {
  assertSize(n);
  return Array.from({ length: n }, (_, i) => i);
}

export function assertPermutation(order: readonly number[], n: number): void {
  assertSize(n);
  if (order.length !== n || new Set(order).size !== n || order.some((i) => !Number.isInteger(i) || i < 0 || i >= n)) {
    throw new DomainError('INVALID_PERMUTATION', '並び順は0〜n−1を過不足なく一度ずつ含む必要があります。');
  }
}

/** order[position] = originalIndex. Inverse maps originalIndex → position. */
export function invertOrder(order: readonly number[]): number[] {
  assertPermutation(order, order.length);
  const inverse = new Array<number>(order.length);
  order.forEach((originalIndex, position) => { inverse[originalIndex] = position; });
  return inverse;
}

export function permuteMatrix(matrix: DenseMatrix, order: readonly number[]): DenseMatrix {
  assertMatrix(matrix);
  assertPermutation(order, matrix.n);
  const values = new Float64Array(matrix.values.length);
  for (let p = 0; p < matrix.n; p++) {
    for (let q = 0; q < matrix.n; q++) {
      values[p * matrix.n + q] = matrix.values[order[p]! * matrix.n + order[q]!]!;
    }
  }
  return { n: matrix.n, values };
}

