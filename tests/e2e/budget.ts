/**
 * 性能目標（仕様§12）は基準端末での値。共有CIランナーは速度の揺れが大きいため、
 * CI（環境変数 CI が設定される GitHub Actions など）では上限を5倍に緩め、停止・ハングの検出だけを保つ。
 * 基準端末での目標達成は、ローカル実行と docs/benchmarks の計測記録で確認する。
 */
export const CI_PERF_FACTOR = 5;
export function perfBudget(ms: number): number {
  return process.env['CI'] ? ms * CI_PERF_FACTOR : ms;
}
