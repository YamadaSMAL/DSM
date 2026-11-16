import { artifactMetadata } from '../io/artifact';
import { runAnalysis } from '../algorithms/registry';
import type { Hierarchy } from '../algorithms/hierarchical';
import type { AnalysisMessage, AnalysisResponse } from './analysisProtocol';
const scope = self as unknown as { onmessage: ((event: MessageEvent<AnalysisMessage>) => void) | null; postMessage(message: AnalysisResponse): void };
const cache = new Map<string, Hierarchy>();
let cancelled = '';
scope.onmessage = async ({ data }) => {
  if (data.type === 'cancel') { cancelled = data.runId; return; }
  const { runId, dataRevision } = data;
  const start = performance.now(); let lastYield = start, lastProgress = -Infinity;
  try {
    const result = await runAnalysis(data.source, data.algorithmId, data.parameters, data.options, runId, {
      async checkpoint(progress) {
        const now = performance.now();
        if (now - lastYield >= 8) { await new Promise(resolve => setTimeout(resolve, 0)); lastYield = performance.now(); }
        if (cancelled === runId) throw new Error('cancelled');
        if (performance.now() - start >= 30_000) throw new Error('limit-reached');
        if (now - lastProgress >= 200) { scope.postMessage({ runId, dataRevision, status: 'progress', progress: { ...progress, elapsedMs: now - start } }); lastProgress = now; }
      },
    }, cache);
    result.environment=artifactMetadata();
    scope.postMessage({ runId, dataRevision, status: 'completed', result });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    const status = message === 'cancelled' || message === 'limit-reached' ? message : 'failed';
    scope.postMessage({ runId, dataRevision, status, error: status === 'cancelled' ? '解析を取り消しました。' : status === 'limit-reached' ? '30秒の上限に達しました。完了結果は保持しています。' : message });
  }
};
