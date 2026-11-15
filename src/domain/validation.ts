import { MAX_ELEMENTS, type DenseMatrix } from './types';

export class DomainError extends Error {
  constructor(readonly code: string, message: string) {
    super(message);
    this.name = 'DomainError';
  }
}

export function assertSize(n: number): void {
  if (!Number.isInteger(n) || n < 1 || n > MAX_ELEMENTS) {
    throw new DomainError('INVALID_SIZE', `要素数は1〜${MAX_ELEMENTS}の整数が必要です。`);
  }
}

export function assertMatrix(matrix: DenseMatrix): void {
  assertSize(matrix.n);
  if (!(matrix.values instanceof Float64Array) || matrix.values.length !== matrix.n ** 2) {
    throw new DomainError('INVALID_SHAPE', '行列の値はn×n個のFloat64Arrayが必要です。');
  }
  for (const [index, value] of matrix.values.entries()) {
    if (!Number.isFinite(value) || value < 0) {
      throw new DomainError('INVALID_VALUE', `セル[${Math.floor(index / matrix.n) + 1},${index % matrix.n + 1}]は非負の有限数が必要です。`);
    }
  }
}

export function assertZeroDiagonal(matrix: DenseMatrix): void {
  for (let i = 0; i < matrix.n; i++) {
    if (matrix.values[i * matrix.n + i] !== 0) {
      throw new DomainError('NONZERO_DIAGONAL', '指標には対角を除外した解析行列を渡してください。');
    }
  }
}

export function finiteResult(value: number): number {
  if (!Number.isFinite(value)) {
    throw new DomainError('NUMERIC_OVERFLOW', '重みまたはコストが数値の計算範囲を超えました。');
  }
  return value;
}

