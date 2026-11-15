import type { InputConvention, MatrixData } from '../domain';
export interface ImportOptions {
  labels: boolean;
  convention: InputConvention;
  encoding: 'utf-8' | 'shift_jis';
  delimiter: '' | ',' | '\t' | ';';
  sheet: string;
  range: string;
  symbols: boolean;
  blanks: boolean;
  diagonalBlanks: boolean;
  cachedFormula: boolean;
  reorderColumns: boolean;
}
export const defaultOptions: ImportOptions = {
  labels: true, convention: 'row-depends-on-column', encoding: 'utf-8', delimiter: '',
  sheet: '', range: '', symbols: false, blanks: false, diagonalBlanks: false,
  cachedFormula: false, reorderColumns: false,
};
export interface SourceCell { value: string | number | boolean | null; type: string; formula?: string }
export interface SourceTable { rows: SourceCell[][]; sheet?: string; range?: string; detectedDelimiter?: string; rowOffset: number; colOffset: number }
export interface Issue { cell: string; original: string; reason: string; fix: string }
export interface ImportPreview {
  sourceName: string;
  source: SourceTable;
  sheets: string[];
  issues: Issue[];
  issueCount: number;
  warnings: string[];
  columnProposal: string[];
  matrix: MatrixData | null;
  inputHash: string | null;
  elapsedMs: number;
}
export const MAX_FILE_BYTES = 20 * 1024 * 1024;
