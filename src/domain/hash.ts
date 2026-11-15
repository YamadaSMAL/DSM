import { CONVENTION, type MatrixData, type PreprocessingOptions } from './types';
import { assertMatrix, DomainError } from './validation';
import { preprocess } from './preprocessing';

/** For original File.arrayBuffer() bytes; separate from the semantic input hash. */
export async function sha256Bytes(bytes: ArrayBuffer): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', bytes);
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, '0')).join('');
}

/** Explicit key order; independent of source filename, timestamps and object insertion order. */
export function canonicalAnalysisInput(matrix: MatrixData, options: PreprocessingOptions = {}): string {
  assertMatrix(matrix);
  if (matrix.schemaVersion !== 1 || matrix.convention !== CONVENTION || matrix.elements.length !== matrix.n ||
      matrix.elements.some((e, i) => e.id !== `e${String(i + 1).padStart(6, '0')}` || e.originalIndex !== i || typeof e.label !== 'string' || !e.label.trim())) {
    throw new DomainError('INVALID_MODEL', '入力ハッシュの要素情報・スキーマ・方向が不正です。');
  }
  const { options: normalizedOptions } = preprocess(matrix, options);
  return JSON.stringify({
    hashVersion: 'dsm-analysis-input-v1',
    convention: matrix.convention,
    n: matrix.n,
    elements: matrix.elements.map((e) => ({ id: e.id, label: e.label, originalIndex: e.originalIndex })),
    values: Array.from(matrix.values),
    preprocessing: { diagonal: 'exclude', threshold: normalizedOptions.threshold, binary: normalizedOptions.binary, symmetry: 'mean' },
  });
}

export async function analysisInputHash(matrix: MatrixData, options: PreprocessingOptions = {}): Promise<string> {
  const bytes = new TextEncoder().encode(canonicalAnalysisInput(matrix, options));
  return sha256Bytes(bytes.buffer);
}

