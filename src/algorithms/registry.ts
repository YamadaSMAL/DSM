import { normalizeConstraints, CONSTRAINT_CAPABILITIES } from './constraints';
import { runGenetic } from './genetic';
import { proposeTearing } from './tearing';
import { analysisInputHash, identityOrder, preprocess, structureMetrics, DomainError, type MatrixData, type PreprocessingOptions } from '../domain';
import { buildHierarchy, cutHierarchy, defaultK, immediateContext, type ComputeContext, type Hierarchy } from './hierarchical';
import { partitionProcess, processViewMetrics } from './process';
import { annealClusters, annealSequence, type AnnealingOptions } from './annealing';
import { runMcl } from './mcl';
import { assertSeed, PRNG_VERSION } from './random';
import type { AlgorithmPlugin, AnalysisInput, Parameters, RunResult } from './types';
const common = { version: '1.0.0', limits: { maxN: 500 }, capabilities: { seeded: false, constraints: [] } };
export const algorithms: readonly AlgorithmPlugin[] = [
  { ...common, id: 'hierarchical-average-v1', label: '平均連結の階層クラスタリング', mode: 'structure', baseline: false,
    validate: (input, p) => Number.isInteger(p.k) && p.k! >= 1 && p.k! <= input.source.n ? [] : ['kは1〜要素数の整数が必要です。'],
    async run(input, p, context, cache) {
      let tree = cache.get(input.inputHash); const cacheHit = !!tree;
      if (!tree) { tree = await buildHierarchy(input.matrices.symmetric, context); if (cache.size >= 4) cache.delete(cache.keys().next().value!); cache.set(input.inputHash, tree); }
      return { ...cutHierarchy(tree, p.k!), hierarchy: tree, cacheHit, iterations: cacheHit ? 0 : tree.merges.length, evaluations: cacheHit ? 0 : tree.evaluations };
    } },
  { ...common, id: 'scc-tarjan-kahn-v1', label: 'Tarjan SCC + Kahn先行順・Band', mode: 'process', baseline: false,
    validate: () => [], async run(input, _p, context) {
      await context.checkpoint({ iterations: 0, evaluations: 0, phase: 'SCCと縮約DAGの構築' });
      const scc = partitionProcess(input.matrices.directed);
      await context.checkpoint({ iterations: input.source.n, evaluations: input.source.n ** 2, phase: '順序・Bandの確定' });
      return { order: scc.order, scc, sccMembership: scc.membership, bandByElement: scc.bandByElement, iterations: input.source.n, evaluations: input.source.n ** 2 };
    } },
  ...(['structure','process'] as const).map(mode=>({...common,id:mode==='structure'?'sa-cluster-v1':'sa-sequence-v1',label:mode==='structure'?'焼きなまし（構造所属）':'焼きなまし（SCC内順序）',mode,baseline:false,capabilities:{seeded:true,constraints:[]},validate:()=>[],async run(input:AnalysisInput,p:Parameters,context:ComputeContext){const options:AnnealingOptions={alpha:p.alpha??1,maxProposals:p.maxProposals!,maxEvaluations:p.maxEvaluations!,coolingInterval:p.coolingInterval!,coolingRate:p.coolingRate!,temperatureFloor:p.temperatureFloor!,temperatureSamples:p.temperatureSamples!,initialization:p.initialization??'separate',k:p.k??defaultK(input.source.n)};return mode==='structure'?annealClusters(input.matrices.symmetric,options,p.seed!,context):annealSequence(input.matrices.directed,options,p.seed!,context);}})),
  {...common,id:'mcl-exclusive-v1',label:'MCL（アプリ独自の排他的抽出）',mode:'structure',baseline:false,limits:{maxN:200},validate:()=>[],async run(input,p,context){const {transition:_transition,...result}=await runMcl(input.matrices.symmetric,p.inflation,p.maxIterations,context);return result;}},
  {...common,id:'ga-cluster-v1',label:'汎用GA（IGTA系とは独立）',mode:'structure',baseline:false,capabilities:{seeded:true,constraints:CONSTRAINT_CAPABILITIES},validate:()=>[],run:(input,p,context)=>runGenetic(input.matrices.symmetric,p,p.seed!,context)},
  {...common,id:'tearing-greedy-v1',label:'Tearing（循環依存の仮定提案）',mode:'process',baseline:false,validate:()=>[],run:(input,p,context)=>proposeTearing(input.matrices.directed,p.maxTears!,context)},
  ...(['separate', 'single'] as const).map(kind => ({ ...common, id: `baseline-${kind}-v1`, label: kind === 'single' ? '比較基準: 全要素一クラスタ' : '比較基準: 全要素別クラスタ', mode: 'structure' as const, baseline: true,
    validate: () => [], async run(input: AnalysisInput) { return { order: identityOrder(input.source.n), membership: identityOrder(input.source.n).map(i => kind === 'single' ? 0 : i), iterations: 0, evaluations: 0 }; } })),
  { ...common, id: 'baseline-identity-v1', label: '比較基準: 入力順（Identity）', mode: 'process', baseline: true, validate: () => [], async run(input) { return { order: identityOrder(input.source.n), scc: partitionProcess(input.matrices.directed), iterations: 0, evaluations: 0 }; } },
];
export async function runAnalysis(source: MatrixData, algorithmId: string, parameters: Parameters, options: PreprocessingOptions = {}, runId = 'local', context: ComputeContext = immediateContext, cache = new Map<string, Hierarchy>()): Promise<RunResult> {
  const start = performance.now(), plugin = algorithms.find(a => a.id === algorithmId);
  if (!plugin) throw new DomainError('UNKNOWN_ALGORITHM', '手法が登録されていません。');
  if (source.n > plugin.limits.maxN) throw new DomainError('ALGORITHM_LIMIT', 'この手法の対応上限を超えています。');
  const matrices = preprocess(source, options), inputHash = await analysisInputHash(source, options);
  const normalized=normalizeParameters(source.n,algorithmId,parameters);
  if(plugin.capabilities.seeded)assertSeed(parameters.seed??0);else if(parameters.seed!==undefined)throw new DomainError('INVALID_SEED','決定的手法にseedは不要です。');
  const input = { source, matrices, inputHash }, issues = plugin.validate(input, normalized);
  if (issues.length) throw new DomainError('INVALID_PARAMETERS', issues.join(' '));
  const solution = await plugin.run(input, plugin.capabilities.seeded?{...normalized,seed:parameters.seed??0}:normalized, context, cache);
  if(context.replay?.status){solution.status=context.replay.status;solution.stopReason=context.replay.stopReason!;}
  const warnings: string[] = [];
  let metrics: Record<string, number | null>, metricVersions: Record<string, string>;
  if (plugin.mode === 'structure') {
    const { version, ...values } = structureMetrics(matrices.symmetric, solution.membership!, normalized.alpha); metrics = values; metricVersions = { structure: version };
    warnings.push(algorithmId==='ga-cluster-v1'?'汎用GAです。IGTA系ではありません。制約を満たす最良解を保持しますが、大域最適を保証しません。':algorithmId==='sa-cluster-v1'?'有限予算の焼きなまし探索です。最良解を保持しますが、大域最適を保証しません。':algorithmId==='mcl-exclusive-v1'?'mcl-exclusive-v1はアプリ独自の排他的抽出とpruningを使います。公式mclコマンドとの一致を保証しません。':plugin.baseline ? '比較基準です。最適化手法ではありません。' : '平均連結は直接結合の類似度による分割です。調整コストの大域最適解を保証しません。');
  } else {
    const { version, orderGuaranteed: _guarantee, ...values } = processViewMetrics(matrices.directed, solution.order, solution.scc!); metrics = values; metricVersions = { process: version };
    warnings.push(algorithmId==='tearing-greedy-v1'?'Tearingは元依存を変更しない仮定提案です。最小フィードバック辺集合や実際の仮定コストを保証しません。指標は元Dで、仮想指標は別記します。':algorithmId==='sa-sequence-v1'?'SCC間の先行順を固定し、SCC内部だけを焼きなましで探索しました。循環や大域最適性は保証しません。':'SCC内部は元index順です。循環は残り、ブロック内の順序最適化はM4です。Bandは資源制約を考慮した同時実行の保証ではありません。');
  }
  await context.checkpoint({ iterations: solution.iterations, evaluations: solution.evaluations, phase: '指標の評価完了' });
  const finalStop=context.shouldStop?.();if(finalStop&&(algorithmId.startsWith('sa-')||algorithmId==='mcl-exclusive-v1'||algorithmId==='ga-cluster-v1'||algorithmId==='tearing-greedy-v1')){solution.status=finalStop==='cancelled'?'cancelled':'limit-reached';solution.stopReason=finalStop;}
  if(solution.status&&solution.status!=='completed')warnings.push('暫定結果です。通常の成功結果ランキングから除外します。');
  if(solution.converged===false)warnings.push('MCLは未収束です。反復上限または中断時の排他的所属です。');
  return { ...solution, ...(solution.scc ? { sccMembership: solution.scc.membership, bandByElement: solution.scc.bandByElement } : {}), runId, inputHash, dataRevision: source.revision, mode: plugin.mode, algorithm: { id: plugin.id, version: plugin.version }, parameters: normalized, options: matrices.options, preprocessing: [...matrices.transformations], ...(plugin.capabilities.seeded?{seed:parameters.seed??0,prngVersion:PRNG_VERSION}:{}), status: solution.status??'completed', stopReason: solution.stopReason??'決定的手法の処理完了', metrics, metricVersions, elapsedMs: performance.now() - start, warnings };
}
/** k is an algorithm setting, not a common objective parameter; baselines remain comparable. */
export function comparisonKey(run: RunResult): string { return JSON.stringify([run.inputHash, run.mode, run.metricVersions, run.mode === 'structure' ? run.parameters.alpha : null, run.parameters.constraints??'constraints:none',run.tearing?'tearing:proposal':'original']); }
export function compareResults(a: RunResult, b: RunResult): number {
  if (comparisonKey(a) !== comparisonKey(b)) throw new DomainError('INCOMPARABLE', '異なる解析条件は順位付けできません。');
  if(!isRankable(a)||!isRankable(b))throw new DomainError('PROVISIONAL','暫定・未収束結果は順位付けできません。');
  return a.mode === 'structure' ? a.metrics['coordinationCost']! - b.metrics['coordinationCost']! : a.metrics['feedbackWeight']! - b.metrics['feedbackWeight']! || a.metrics['feedbackCount']! - b.metrics['feedbackCount']!;
}

export function isRankable(run:RunResult):boolean{return run.status==='completed'&&run.converged!==false&&!run.tearing;}
export function normalizeParameters(n:number,id:string,p:Parameters):Parameters{
  const plugin=algorithms.find(a=>a.id===id);if(!plugin)throw new DomainError('UNKNOWN_ALGORITHM','未知の手法です。');
  const result:Parameters=plugin.mode==='structure'?{alpha:p.alpha??1}:{};
  const bad=(message:string):never=>{throw new DomainError('INVALID_PARAMETERS',message);};
  if(plugin.mode==='structure'&&(!Number.isFinite(result.alpha)||result.alpha!<=0||result.alpha!>3))bad('αは0より大きく3以下が必要です。');
  const integer=(value:number|undefined,fallback:number,min:number,max:number)=>{const v=value??fallback;if(!Number.isSafeInteger(v)||v<min||v>max)bad(`整数パラメータは${min}〜${max}が必要です。`);return v;};
  if(id==='hierarchical-average-v1')result.k=integer(p.k,defaultK(n),1,n);
  if(id.startsWith('sa-')){
    result.maxProposals=integer(p.maxProposals,100000,1,100000);result.maxEvaluations=integer(p.maxEvaluations,100101,1,100101);result.coolingInterval=integer(p.coolingInterval,1000,1,100000);result.coolingRate=p.coolingRate??.95;result.temperatureFloor=p.temperatureFloor??1e-12;result.temperatureSamples=100;
    if(!Number.isFinite(result.coolingRate)||result.coolingRate<=0||result.coolingRate>=1||!Number.isFinite(result.temperatureFloor)||result.temperatureFloor<=0||result.temperatureFloor>1||p.temperatureSamples!==undefined&&p.temperatureSamples!==100)bad('冷却率は0より大きく1未満、温度下限は0より大きく1以下、温度調査は100近傍です。');
    if(id==='sa-cluster-v1'){result.initialization=p.initialization??'separate';if(!['separate','hierarchical'].includes(result.initialization))bad('初期所属が不正です。');if(result.initialization==='hierarchical')result.k=integer(p.k,defaultK(n),1,n);}
  }
  if(id==='mcl-exclusive-v1'){
    result.inflation=p.inflation??2;result.maxIterations=integer(p.maxIterations,100,1,100);result.pruneThreshold=1e-8;result.convergenceTolerance=1e-6;result.stableIterations=5;
    if(!Number.isFinite(result.inflation)||result.inflation<1.2||result.inflation>5||p.pruneThreshold!==undefined&&p.pruneThreshold!==1e-8||p.convergenceTolerance!==undefined&&p.convergenceTolerance!==1e-6||p.stableIterations!==undefined&&p.stableIterations!==5)bad('MCLのinflationは1.2〜5、prune=1e-8、収束差1e-6を5回です。');
  }
  const constraints=normalizeConstraints(n,p.constraints);
  if(constraints){if(!plugin.capabilities.constraints.length)bad('この手法は指定制約に対応していません。');result.constraints=constraints;}
  if(id==='ga-cluster-v1'){
    result.populationSize=integer(p.populationSize,50,4,100);result.generations=integer(p.generations,200,1,500);result.tournamentSize=integer(p.tournamentSize,3,2,result.populationSize);result.eliteCount=integer(p.eliteCount,2,1,result.populationSize-1);result.crossoverRate=p.crossoverRate??.8;result.mutationRate=p.mutationRate??1/n;
    for(const rate of [result.crossoverRate,result.mutationRate])if(!Number.isFinite(rate)||rate<0||rate>1)bad('GA確率は0〜1が必要です。');
  }
  if(id==='tearing-greedy-v1')result.maxTears=integer(p.maxTears,Math.min(10000,Math.max(1,n*(n-1))),1,Math.max(1,n*(n-1)));
  return result;
}
