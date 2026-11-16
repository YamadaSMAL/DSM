import type { MatrixData, PreprocessingOptions } from '../domain';
import type { Parameters, RunResult } from '../algorithms/types';
import type { AnalysisResponse } from './analysisProtocol';
export class AnalysisStopped extends Error {
  constructor(readonly status: 'cancelled' | 'limit-reached' | 'failed', message: string) { super(message); }
}
export class AnalysisClient {
  private worker: Worker | null = null;
  private active: { runId: string; revision: number; reject: (error: Error) => void; timer: ReturnType<typeof setTimeout>; cancelTimer?: ReturnType<typeof setTimeout>; cancelling: boolean } | null = null;
  dispose() {
    this.worker?.terminate(); this.worker = null;
    if (this.active) { clearTimeout(this.active.timer); clearTimeout(this.active.cancelTimer); this.active.reject(new AnalysisStopped('cancelled', '解析を取り消しました。')); this.active = null; }
  }
  cancel() {
    const active = this.active;
    if (!active || active.cancelling) return;
    active.cancelling = true;
    this.worker?.postMessage({ type: 'cancel', runId: active.runId, dataRevision: active.revision });
    active.cancelTimer = setTimeout(() => this.dispose(), 1000);
  }
  run(source: MatrixData, algorithmId: string, parameters: Parameters, options: PreprocessingOptions, progress: (response: Extract<AnalysisResponse, { status: 'progress' }>) => void): Promise<RunResult> {
    if (this.active) this.dispose();
    this.worker ??= new Worker(new URL('./analysis.worker.ts', import.meta.url), { type: 'module' });
    const worker = this.worker, runId = crypto.randomUUID();
    // Transfer only a copy. The source's original buffer remains attached to the UI.
    const snapshot = { ...source, values: source.values.slice() };
    return new Promise((resolve, reject) => {
      const finish = () => { const active = this.active; if (active?.runId === runId) { clearTimeout(active.timer); clearTimeout(active.cancelTimer); this.active = null; } };
      this.active = { runId, revision: source.revision, reject, cancelling: false, timer: setTimeout(() => { finish(); worker.terminate(); if (this.worker === worker) this.worker = null; reject(new AnalysisStopped('limit-reached', '30秒の上限に達しました。')); }, 31_000) };
      worker.onmessage = ({ data }: MessageEvent<AnalysisResponse>) => {
        const active = this.active;
        if (this.worker !== worker || !active || data.runId !== runId || data.dataRevision !== source.revision) return;
        if (data.status === 'progress') { if (!active.cancelling) progress(data); return; }
        const cancelling = active.cancelling; finish();
        if (cancelling && !(data.status==='completed'&&data.result.status==='cancelled')) reject(new AnalysisStopped('cancelled', '解析を取り消しました。'));
        else if (data.status === 'completed') resolve(data.result);
        else reject(new AnalysisStopped(data.status, data.error));
      };
      worker.onerror = () => { if (this.worker !== worker) return; finish(); worker.terminate(); this.worker = null; reject(new AnalysisStopped('failed', '解析Workerが異常終了しました。完了結果は保持しています。')); };
      try { worker.postMessage({ type: 'run', runId, dataRevision: source.revision, source: snapshot, algorithmId, parameters, options }, [snapshot.values.buffer]); }
      catch (error) { finish(); worker.terminate(); this.worker = null; reject(error); }
    });
  }
}
