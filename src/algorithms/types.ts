import type { AnalysisMatrices, AnalysisMode, MatrixData, Transformation } from '../domain';
import type { ComputeContext, Hierarchy } from './hierarchical';
import type { ClusterConstraints } from './constraints';
import type { ProcessMetrics } from '../domain';
import type { SccResult } from './process';
export interface TearingProposal { edges: {from:number;to:number;weight:number}[]; totalWeight:number;virtualOrder:number[];virtualMetrics:ProcessMetrics;acyclic:boolean }
export interface Parameters { costExponent?:number;secondBidDenominator?:number;acceptDenominator?:number;clusterSlots?:number;packing?:'horizontal'|'vertical';mdlAlpha?:number;mdlBeta?:number; constraints?:ClusterConstraints;populationSize?:number;generations?:number;tournamentSize?:number;eliteCount?:number;crossoverRate?:number;mutationRate?:number;maxTears?:number; k?: number; alpha?: number;seed?:number;maxProposals?:number;maxEvaluations?:number;coolingInterval?:number;coolingRate?:number;temperatureFloor?:number;temperatureSamples?:number;initialization?:'separate'|'hierarchical';inflation?:number;maxIterations?:number;pruneThreshold?:number;convergenceTolerance?:number;stableIterations?:number }
export interface AnalysisInput { source: MatrixData; matrices: AnalysisMatrices; inputHash: string }
export interface Solution { objective?:{name:'totalCost'|'mdl';value:number;version:string;conditions:Record<string,number|string>}; tearing?:TearingProposal; order: number[]; membership?: number[]; sccMembership?: number[]; bandByElement?: number[]; scc?: SccResult; hierarchy?: Hierarchy; cacheHit?: boolean; iterations: number; evaluations: number;status?:'completed'|'limit-reached'|'cancelled';stopReason?:string;converged?:boolean;initialState?:{order:number[];membership?:number[]};trace?:Record<string,number> }
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
  environment?: {createdAt:string;timeZone:string;appVersion:string;appCommit:string;userAgent:string};
  seed?:number;prngVersion?:string;batch?:{id:string;rootSeed:number;index:number;count:number;seeds?:number[]};
  status: 'completed'|'limit-reached'|'cancelled'; stopReason: string; metrics: Record<string, number | null>; metricVersions: Record<string, string>;
  elapsedMs: number; warnings: string[];
}
