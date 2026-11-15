import type { ImportOptions, ImportPreview } from '../io/types';
export interface ImportRequest { runId: string; dataRevision: number; bytes: ArrayBuffer; name: string; options: ImportOptions }
export type ImportResponse = { runId: string; dataRevision: number } & ({ status: 'completed'; preview: ImportPreview } | { status: 'failed'; error: string });
export function isCurrent(response: Pick<ImportResponse, 'runId' | 'dataRevision'>, runId: string, revision: number): boolean {
  return response.runId === runId && response.dataRevision === revision;
}
