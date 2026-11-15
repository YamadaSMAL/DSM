import { CONVENTION, type DenseMatrix, type DependencyEdge, type InputConvention, type MatrixData, type Provenance } from './types';
import { assertMatrix, assertSize, DomainError } from './validation';

/** Numeric import boundary. CSV/XLSX cell parsing and label matching belong to M1. */
export function fromRows(rows: readonly (readonly number[])[]): DenseMatrix {
  const n = rows.length;
  assertSize(n);
  if (rows.some((row) => row.length !== n)) {
    throw new DomainError('INVALID_SHAPE', '行列は正方である必要があります。');
  }
  // Guard before conversion so malformed runtime input is not silently coerced by Float64Array.
  for (const row of rows) {
    for (const value of row) {
      if (typeof value !== 'number') throw new DomainError('INVALID_VALUE', '数値以外のセルは変換前に検証してください。');
    }
  }
  const matrix = { n, values: new Float64Array(rows.flat().map((value) => value === 0 ? 0 : value)) };
  assertMatrix(matrix);
  return matrix;
}

export function transpose(matrix: DenseMatrix): DenseMatrix {
  assertMatrix(matrix);
  const values = new Float64Array(matrix.values.length);
  for (let i = 0; i < matrix.n; i++) {
    for (let j = 0; j < matrix.n; j++) {
      values[i * matrix.n + j] = matrix.values[j * matrix.n + i]!;
    }
  }
  return { n: matrix.n, values };
}

export interface CreateMatrixOptions {
  readonly convention: InputConvention;
  readonly provenance: Provenance;
  readonly labels?: readonly string[];
  readonly revision?: number;
}

export function createMatrixData(rows: readonly (readonly number[])[], options: CreateMatrixOptions): MatrixData {
  const input = fromRows(rows);
  const revision = options.revision ?? 1;
  if (!Number.isSafeInteger(revision) || revision < 1) {
    throw new DomainError('INVALID_REVISION', 'revisionは1以上の安全な整数が必要です。');
  }
  if (options.convention !== CONVENTION && options.convention !== 'row-supplies-column') {
    throw new DomainError('INVALID_CONVENTION', '依存方向を明示してください。');
  }
  if (!/^[0-9a-f]{64}$/i.test(options.provenance.sourceSha256)) {
    throw new DomainError('INVALID_SOURCE_HASH', '原ファイルのSHA-256が必要です。');
  }
  const labels = options.labels ?? Array.from({ length: input.n }, (_, i) => `要素${i + 1}`);
  if (labels.length !== input.n || labels.some((label) => typeof label !== 'string' || !label.trim() || label.trim().length > 200)) {
    throw new DomainError('INVALID_LABELS', '要素数と同数の、空でない200文字以内のラベルが必要です。');
  }
  const elements = labels.map((label, originalIndex) => ({
    id: `e${String(originalIndex + 1).padStart(6, '0')}`,
    label: label.trim(),
    originalIndex,
  }));
  const converted = options.convention === 'row-supplies-column';
  const normalized = converted ? transpose(input) : input;
  return {
    schemaVersion: 1,
    revision,
    ...normalized,
    elements,
    convention: CONVENTION,
    provenance: {
      ...structuredClone(options.provenance),
      sourceSha256: options.provenance.sourceSha256.toLowerCase(),
      importOptions: { ...structuredClone(options.provenance.importOptions), inputConvention: options.convention },
      transformations: [
        ...structuredClone(options.provenance.transformations),
        ...(converted ? [{ kind: 'transpose', params: { from: options.convention, to: CONVENTION }, affectedCells: input.n * (input.n - 1) }] : []),
      ],
    },
  };
}

/** Deterministic order: provider index then receiver index. Diagonal is metadata. */
export function dependencyEdges(matrix: DenseMatrix): DependencyEdge[] {
  assertMatrix(matrix);
  const edges: DependencyEdge[] = [];
  for (let from = 0; from < matrix.n; from++) {
    for (let to = 0; to < matrix.n; to++) {
      const weight = matrix.values[to * matrix.n + from]!;
      if (to !== from && weight > 0) edges.push({ from, to, weight });
    }
  }
  return edges;
}

