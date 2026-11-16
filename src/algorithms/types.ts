import type { AnalysisMatrices, AnalysisMode, MatrixData, Transformation } from '../domain';
import type { ComputeContext, Hierarchy } from './hierarchical';
import type { SccResult } from './process';
export interface Parameters { k?: number; alpha?: number }
export interface AnalysisInput { source: MatrixData; matrices: AnalysisMatrices; inputHash: string }
export interface Solution { order: number[]; membership?: number[]; sccMembership?: number[]; bandByElement?: number[]; scc?: SccResult; hierarchy?: Hierarchy; cacheHit?: boolean; iterations: number; evaluations: number }
export interface AlgorithmPlugin {
  id: string; version: string; label: string; mode: AnalysisMode; baseline: boolean;
  limits: { maxN: number }; capabilities: { seeded: boolean; constraints: string[] };
  validate(input: AnalysisInput, parameters: Parameters): string[];
  run(input: AnalysisInput, parameters: Parameters, context: ComputeContext, cache: Map<string, Hierarchy>): Promise<Solution>;
}
export interface RunResult extends Solution {
  runId: string; inputHash: string; dataRevision: number; mode: AnalysisMode;
  algorithm: { id: string; version: string }; parameters: Parameters;
  preprocessing: Transformation[]; options: { threshold: number; binary: boolean };
  status: 'completed'; stopReason: string; metrics: Record<string, number | null>; metricVersions: Record<string, string>;
  elapsedMs: number; warnings: string[];
}
