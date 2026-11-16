import { analysisInputHash, identityOrder, preprocess, structureMetrics, DomainError, type MatrixData, type PreprocessingOptions } from '../domain';
import { buildHierarchy, cutHierarchy, defaultK, immediateContext, type ComputeContext, type Hierarchy } from './hierarchical';
import { partitionProcess, processViewMetrics } from './process';
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
  ...(['separate', 'single'] as const).map(kind => ({ ...common, id: `baseline-${kind}-v1`, label: kind === 'single' ? '比較基準: 全要素一クラスタ' : '比較基準: 全要素別クラスタ', mode: 'structure' as const, baseline: true,
    validate: () => [], async run(input: AnalysisInput) { return { order: identityOrder(input.source.n), membership: identityOrder(input.source.n).map(i => kind === 'single' ? 0 : i), iterations: 0, evaluations: 0 }; } })),
  { ...common, id: 'baseline-identity-v1', label: '比較基準: 入力順（Identity）', mode: 'process', baseline: true, validate: () => [], async run(input) { return { order: identityOrder(input.source.n), scc: partitionProcess(input.matrices.directed), iterations: 0, evaluations: 0 }; } },
];
export async function runAnalysis(source: MatrixData, algorithmId: string, parameters: Parameters, options: PreprocessingOptions = {}, runId = 'local', context: ComputeContext = immediateContext, cache = new Map<string, Hierarchy>()): Promise<RunResult> {
  const start = performance.now(), plugin = algorithms.find(a => a.id === algorithmId);
  if (!plugin) throw new DomainError('UNKNOWN_ALGORITHM', '手法が登録されていません。');
  if (source.n > plugin.limits.maxN) throw new DomainError('ALGORITHM_LIMIT', 'この手法の対応上限を超えています。');
  const matrices = preprocess(source, options), inputHash = await analysisInputHash(source, options);
  const normalized: Parameters = plugin.mode === 'structure' ? { alpha: parameters.alpha ?? 1, ...(plugin.id === 'hierarchical-average-v1' ? { k: parameters.k ?? defaultK(source.n) } : {}) } : {};
  if (plugin.mode === 'structure' && (!Number.isFinite(normalized.alpha) || normalized.alpha! <= 0 || normalized.alpha! > 3)) throw new DomainError('INVALID_ALPHA', 'αは0より大きく3以下が必要です。');
  const input = { source, matrices, inputHash }, issues = plugin.validate(input, normalized);
  if (issues.length) throw new DomainError('INVALID_PARAMETERS', issues.join(' '));
  const solution = await plugin.run(input, normalized, context, cache);
  const warnings: string[] = [];
  let metrics: Record<string, number | null>, metricVersions: Record<string, string>;
  if (plugin.mode === 'structure') {
    const { version, ...values } = structureMetrics(matrices.symmetric, solution.membership!, normalized.alpha); metrics = values; metricVersions = { structure: version };
    warnings.push(plugin.baseline ? '比較基準です。最適化手法ではありません。' : '平均連結は直接結合の類似度による分割です。調整コストの大域最適解を保証しません。');
  } else {
    const { version, orderGuaranteed: _guarantee, ...values } = processViewMetrics(matrices.directed, solution.order, solution.scc!); metrics = values; metricVersions = { process: version };
    warnings.push('SCC内部は元index順です。循環は残り、ブロック内の順序最適化はM4です。Bandは資源制約を考慮した同時実行の保証ではありません。');
  }
  await context.checkpoint({ iterations: solution.iterations, evaluations: solution.evaluations, phase: '指標の評価完了' });
  return { ...solution, ...(solution.scc ? { sccMembership: solution.scc.membership, bandByElement: solution.scc.bandByElement } : {}), runId, inputHash, dataRevision: source.revision, mode: plugin.mode, algorithm: { id: plugin.id, version: plugin.version }, parameters: normalized, options: matrices.options, preprocessing: [...matrices.transformations], status: 'completed', stopReason: '決定的手法の処理完了', metrics, metricVersions, elapsedMs: performance.now() - start, warnings };
}
/** k is an algorithm setting, not a common objective parameter; baselines remain comparable. */
export function comparisonKey(run: RunResult): string { return JSON.stringify([run.inputHash, run.mode, run.metricVersions, run.mode === 'structure' ? run.parameters.alpha : null, 'constraints:none']); }
export function compareResults(a: RunResult, b: RunResult): number {
  if (comparisonKey(a) !== comparisonKey(b)) throw new DomainError('INCOMPARABLE', '異なる解析条件は順位付けできません。');
  return a.mode === 'structure' ? a.metrics['coordinationCost']! - b.metrics['coordinationCost']! : a.metrics['feedbackWeight']! - b.metrics['feedbackWeight']! || a.metrics['feedbackCount']! - b.metrics['feedbackCount']!;
}
