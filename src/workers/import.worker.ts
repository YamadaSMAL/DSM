import { importFile } from '../io/import';
import type { ImportRequest, ImportResponse } from './protocol';
const scope = self as unknown as { onmessage: ((event: MessageEvent<ImportRequest>) => void) | null; postMessage(message: ImportResponse): void };
scope.onmessage = async ({ data }) => {
  const { runId, dataRevision } = data;
  try { scope.postMessage({ runId, dataRevision, status: 'completed', preview: await importFile(data.bytes, data.name, data.options, dataRevision) }); }
  catch (error) { scope.postMessage({ runId, dataRevision, status: 'failed', error: error instanceof Error ? error.message : String(error) }); }
};
