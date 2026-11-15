import { type DenseMatrix } from './types';
import { assertMatrix, assertZeroDiagonal, DomainError, finiteResult } from './validation';
import { assertPermutation, identityOrder } from './permutation';

export const COORDINATION_VERSION = 'coordination-mean-v1';
export const FEEDBACK_VERSION = 'feedback-weight-v1';

export interface StructureMetrics {
  readonly version: typeof COORDINATION_VERSION;
  readonly alpha: number;
  readonly totalWeight: number;
  readonly internalWeight: number;
  readonly externalWeight: number;
  readonly externalRatio: number | null;
  readonly coordinationCost: number;
  readonly clusterCount: number;
  readonly minClusterSize: number;
  readonly maxClusterSize: number;
  readonly meanClusterSize: number;
}

/** Membership is indexed by original element index, never by display position. */
export function structureMetrics(symmetric: DenseMatrix, membership: readonly number[], alpha = 1): StructureMetrics {
  assertMatrix(symmetric);
  assertZeroDiagonal(symmetric);
  const { n, values } = symmetric;
  if (membership.length !== n || membership.some((c) => !Number.isSafeInteger(c) || c < 0)) {
    throw new DomainError('INVALID_MEMBERSHIP', '各元要素に非負整数のクラスタ番号が一つ必要です。');
  }
  if (!Number.isFinite(alpha) || alpha <= 0 || alpha > 3) {
    throw new DomainError('INVALID_ALPHA', 'αは0より大きく3以下の有限数が必要です。');
  }
  const sizes = new Map<number, number>();
  for (const c of membership) sizes.set(c, (sizes.get(c) ?? 0) + 1);
  let totalWeight = 0;
  let internalWeight = 0;
  let externalWeight = 0;
  let coordinationCost = 0;
  for (let i = 0; i < n; i++) {
    for (let j = i + 1; j < n; j++) {
      const weight = values[i * n + j]!;
      if (weight !== values[j * n + i]) {
        throw new DomainError('NOT_SYMMETRIC', '構造指標には対称化済みのS行列が必要です。');
      }
      const same = membership[i] === membership[j];
      totalWeight = finiteResult(totalWeight + weight);
      if (same) internalWeight = finiteResult(internalWeight + weight);
      else externalWeight = finiteResult(externalWeight + weight);
      const scale = same ? sizes.get(membership[i]!)! : n;
      coordinationCost = finiteResult(coordinationCost + finiteResult(weight * scale ** alpha));
    }
  }
  const clusterSizes = [...sizes.values()];
  return {
    version: COORDINATION_VERSION,
    alpha,
    totalWeight, internalWeight, externalWeight,
    externalRatio: totalWeight === 0 ? null : externalWeight / totalWeight,
    coordinationCost,
    clusterCount: sizes.size,
    minClusterSize: Math.min(...clusterSizes),
    maxClusterSize: Math.max(...clusterSizes),
    meanClusterSize: n / sizes.size,
  };
}

export interface ProcessMetrics {
  readonly version: typeof FEEDBACK_VERSION;
  readonly totalWeight: number;
  readonly feedbackWeight: number;
  readonly feedbackCount: number;
  readonly feedbackRatio: number | null;
}

export function processMetrics(directed: DenseMatrix, order: readonly number[] = identityOrder(directed.n)): ProcessMetrics {
  assertMatrix(directed);
  assertZeroDiagonal(directed);
  assertPermutation(order, directed.n);
  let totalWeight = 0;
  let feedbackWeight = 0;
  let feedbackCount = 0;
  for (let p = 0; p < directed.n; p++) {
    for (let q = 0; q < directed.n; q++) {
      const weight = directed.values[order[p]! * directed.n + order[q]!]!;
      totalWeight = finiteResult(totalWeight + weight);
      if (p < q && weight > 0) {
        feedbackWeight = finiteResult(feedbackWeight + weight);
        feedbackCount++;
      }
    }
  }
  return {
    version: FEEDBACK_VERSION,
    totalWeight, feedbackWeight, feedbackCount,
    feedbackRatio: totalWeight === 0 ? null : feedbackWeight / totalWeight,
  };
}

