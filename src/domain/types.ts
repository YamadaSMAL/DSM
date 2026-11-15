/** Canonical A[i,j] means element i depends on element j. Graph edge: j → i. */
export const CONVENTION = 'row-depends-on-column' as const;
export const MAX_ELEMENTS = 500;
export type InputConvention = typeof CONVENTION | 'row-supplies-column';
export type AnalysisMode = 'structure' | 'process';

export interface Element {
  readonly id: string;
  readonly label: string;
  readonly originalIndex: number;
}
export interface Transformation {
  readonly kind: string;
  readonly params: Readonly<Record<string, unknown>>;
  readonly affectedCells: number;
}
export interface Provenance {
  readonly sourceName: string;
  readonly sourceSha256: string;
  readonly sheet?: string;
  readonly range?: string;
  readonly importOptions: Readonly<Record<string, unknown>>;
  readonly transformations: readonly Transformation[];
}
/** Readonly ownership contract: domain functions never mutate caller-owned buffers. */
export interface DenseMatrix {
  readonly n: number;
  readonly values: Float64Array;
}
export interface MatrixData extends DenseMatrix {
  readonly schemaVersion: 1;
  readonly revision: number;
  readonly elements: readonly Element[];
  readonly convention: typeof CONVENTION;
  readonly provenance: Provenance;
}
export interface PreprocessingOptions {
  readonly threshold?: number;
  readonly binary?: boolean;
}
export interface AnalysisMatrices {
  readonly directed: DenseMatrix;
  readonly symmetric: DenseMatrix;
  readonly options: { readonly threshold: number; readonly binary: boolean };
  readonly transformations: readonly Transformation[];
}
export interface DependencyEdge {
  readonly from: number;
  readonly to: number;
  readonly weight: number;
}

