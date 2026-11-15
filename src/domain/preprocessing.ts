import { type AnalysisMatrices, type DenseMatrix, type PreprocessingOptions } from './types';
import { assertMatrix, DomainError } from './validation';

export function preprocess(matrix: DenseMatrix, options: PreprocessingOptions = {}): AnalysisMatrices {
  assertMatrix(matrix);
  const threshold = options.threshold ?? 0;
  const binary = options.binary ?? false;
  if (!Number.isFinite(threshold) || threshold < 0 || typeof binary !== 'boolean') {
    throw new DomainError('INVALID_PREPROCESSING', '閾値は非負有限数、二値化設定は真偽値が必要です。');
  }
  const values = new Float64Array(matrix.values.length);
  let diagonalCount = 0;
  let thresholdCount = 0;
  let binaryCount = 0;
  for (let i = 0; i < matrix.n; i++) {
    for (let j = 0; j < matrix.n; j++) {
      const index = i * matrix.n + j;
      const value = matrix.values[index]!;
      if (i === j) {
        if (value !== 0) diagonalCount++;
      } else if (value <= threshold) {
        if (value !== 0) thresholdCount++;
      } else {
        values[index] = binary ? 1 : value;
        if (binary && value !== 1) binaryCount++;
      }
    }
  }
  const symmetric = new Float64Array(values.length);
  for (let i = 0; i < matrix.n; i++) {
    for (let j = i + 1; j < matrix.n; j++) {
      const a = values[i * matrix.n + j]!;
      const b = values[j * matrix.n + i]!;
      // Algebraic mean without overflow from a+b, retaining equal subnormal weights.
      const mean = Math.min(a, b) + (Math.max(a, b) - Math.min(a, b)) / 2;
      symmetric[i * matrix.n + j] = mean;
      symmetric[j * matrix.n + i] = mean;
    }
  }
  return {
    directed: { n: matrix.n, values },
    symmetric: { n: matrix.n, values: symmetric },
    options: { threshold: threshold === 0 ? 0 : threshold, binary },
    transformations: [
      { kind: 'exclude-diagonal', params: {}, affectedCells: diagonalCount },
      { kind: 'threshold', params: { threshold, comparison: 'strictly-greater' }, affectedCells: thresholdCount },
      ...(binary ? [{ kind: 'binary', params: {}, affectedCells: binaryCount }] : []),
      { kind: 'symmetric-mean', params: { target: 'structure-only' }, affectedCells: values.reduce((count, value, i) => count + (value !== symmetric[i] ? 1 : 0), 0) },
    ],
  };
}

