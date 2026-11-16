import type { MatrixData, PreprocessingOptions } from '../domain';
import type { Progress } from '../algorithms/hierarchical';
import type { Parameters, RunResult } from '../algorithms/types';
export interface AnalysisRequest { type: 'run'; runId: string; dataRevision: number; source: MatrixData; algorithmId: string; parameters: Parameters; options: PreprocessingOptions }
export type AnalysisMessage = AnalysisRequest | { type: 'cancel'; runId: string; dataRevision: number };
export type AnalysisResponse = { runId: string; dataRevision: number } & (
  { status: 'progress'; progress: Progress & { elapsedMs: number } } |
  { status: 'completed'; result: RunResult } |
  { status: 'cancelled' | 'failed' | 'limit-reached'; error: string });
