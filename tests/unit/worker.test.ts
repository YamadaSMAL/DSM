import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { ImportClient } from '../../src/workers/client';
import { defaultOptions } from '../../src/io/types';
import type { ImportRequest, ImportResponse } from '../../src/workers/protocol';
class FakeWorker {
  static instances: FakeWorker[] = [];
  onmessage: ((event: { data: ImportResponse }) => void) | null = null;
  onerror: (() => void) | null = null;
  request: ImportRequest | undefined;
  terminated = false;
  constructor() { FakeWorker.instances.push(this); }
  postMessage(request: ImportRequest) { this.request = request; }
  terminate() { this.terminated = true; }
  fail() { this.onmessage?.({ data: { runId: this.request!.runId, dataRevision: this.request!.dataRevision, status: 'failed', error: '入力不正' } }); }
}
beforeEach(() => { vi.stubGlobal('Worker', FakeWorker); FakeWorker.instances = []; });
afterEach(() => { vi.unstubAllGlobals(); vi.useRealTimers(); });
const file = () => new File(['0'], 'test.csv');
it('取消は即時terminateし、確定前の処理を破棄する', async () => {
  const client = new ImportClient(); const promise = client.run(file(), defaultOptions, 2); const rejected = expect(promise).rejects.toThrow('取り消し');
  client.cancel(); await rejected; expect(FakeWorker.instances[0]!.terminated).toBe(true);
});
it('再実行時に旧Workerを破棄し、遅着応答を無視する', async () => {
  const client = new ImportClient(); const first = client.run(file(), defaultOptions, 1); const cancelled = expect(first).rejects.toThrow('取り消し');
  await vi.waitFor(() => expect(FakeWorker.instances[0]!.request).toBeDefined());
  const old = FakeWorker.instances[0]!;
  const second = client.run(file(), defaultOptions, 2); const failed = expect(second).rejects.toThrow('入力不正');
  await cancelled; old.fail(); await vi.waitFor(() => expect(FakeWorker.instances[1]!.request).toBeDefined()); FakeWorker.instances[1]!.fail(); await failed;
  expect(old.terminated).toBe(true);
});
it('20秒上限でterminateし、再実行できる', async () => {
  vi.useFakeTimers(); const client = new ImportClient(); const promise = client.run(file(), defaultOptions, 1); const rejected = expect(promise).rejects.toThrow('20秒');
  await vi.advanceTimersByTimeAsync(20_000); await rejected; expect(FakeWorker.instances[0]!.terminated).toBe(true);
  const second = client.run(file(), defaultOptions, 1); const cancelled = expect(second).rejects.toThrow('取り消し'); client.cancel(); await cancelled; expect(FakeWorker.instances).toHaveLength(2);
});
it('Worker異常終了をエラーにしリソースを解放する', async () => {
  const client = new ImportClient(); const promise = client.run(file(), defaultOptions, 1); const rejected = expect(promise).rejects.toThrow('Worker');
  FakeWorker.instances[0]!.onerror!(); await rejected; expect(FakeWorker.instances[0]!.terminated).toBe(true);
});
it('旧ファイル読込の遅着失敗が新Workerのタイムアウトを解除しない', async () => {
  vi.useFakeTimers();
  let rejectRead: (error: Error) => void = () => {};
  const delayed = new File(['0'], 'slow.csv');
  vi.spyOn(delayed, 'arrayBuffer').mockImplementation(() => new Promise((_resolve, reject) => { rejectRead = reject; }));
  const client = new ImportClient(); const first = client.run(delayed, defaultOptions, 1); const cancelled = expect(first).rejects.toThrow('取り消し');
  const second = client.run(file(), defaultOptions, 2); const timedOut = expect(second).rejects.toThrow('20秒');
  await cancelled; rejectRead(new Error('旧ファイルの読込失敗')); await vi.advanceTimersByTimeAsync(20_000); await timedOut;
  expect(FakeWorker.instances[1]!.terminated).toBe(true);
});
