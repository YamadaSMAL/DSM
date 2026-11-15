import type { ImportOptions, ImportPreview } from '../io/types';
import { MAX_FILE_BYTES } from '../io/types';
import { isCurrent, type ImportResponse } from './protocol';
export class ImportClient {
  private worker: Worker | null = null;
  private reject: ((reason: Error) => void) | null = null;
  private timer: ReturnType<typeof setTimeout> | undefined;
  cancel(): void {
    this.worker?.terminate(); this.worker = null;
    clearTimeout(this.timer);
    this.timer = undefined;
    this.reject?.(new Error('取込を取り消しました。確定済みデータは保持しています。'));
    this.reject = null;
  }
  async run(file: File, options: ImportOptions, revision: number): Promise<ImportPreview> {
    this.cancel();
    if (file.size > MAX_FILE_BYTES) throw new Error('ファイルは20MiB以内にしてください。');
    const worker = new Worker(new URL('./import.worker.ts', import.meta.url), { type: 'module' });
    this.worker = worker;
    const runId = crypto.randomUUID();
    return new Promise((resolve, reject) => {
      this.reject = reject;
      const finish = () => { clearTimeout(timer); worker.terminate(); if (this.worker === worker) { this.worker = null; this.reject = null; this.timer = undefined; } };
      const timer = setTimeout(() => { finish(); reject(new Error('取込が20秒の上限に達しました。範囲やファイルを小さくしてください。')); }, 20_000);
      this.timer = timer;
      worker.onmessage = ({ data }: MessageEvent<ImportResponse>) => {
        if (this.worker !== worker || !isCurrent(data, runId, revision)) return;
        finish();
        if (data.status === 'completed') resolve(data.preview); else reject(new Error(data.error));
      };
      worker.onerror = () => { finish(); reject(new Error('取込Workerでエラーが発生しました。確定済みデータは保持しています。')); };
      void file.arrayBuffer().then(bytes => {
        if (this.worker === worker) worker.postMessage({ runId, dataRevision: revision, bytes, name: file.name, options }, [bytes]);
      }).catch(error => { finish(); reject(error); });
    });
  }
}
