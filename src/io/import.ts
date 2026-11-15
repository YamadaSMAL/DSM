import Papa from 'papaparse';
import { Unzip, UnzipInflate, zipSync } from 'fflate';
import { read, utils, type WorkBook } from 'xlsx';
import { sha256Bytes } from '../domain';
import { MAX_FILE_BYTES, type ImportOptions, type ImportPreview, type SourceCell, type SourceTable } from './types';
import { validateTable } from './validate';

export function parseCsv(bytes: ArrayBuffer, options: ImportOptions): SourceTable {
  const text = new TextDecoder(options.encoding, { fatal: true }).decode(bytes);
  const rows: SourceCell[][] = [];
  let pendingEmpty = 0;
  let detectedDelimiter = options.delimiter as string;
  let previousCursor = 0;
  Papa.parse<string[]>(text, {
    delimiter: options.delimiter, delimitersToGuess: [',', '\t', ';'], dynamicTyping: false, skipEmptyLines: false,
    step(result, parser) {
      detectedDelimiter = result.meta.delimiter;
      const errors = result.errors.filter(e => e.code !== 'UndetectableDelimiter');
      if (errors.length) { parser.abort(); throw new Error(`CSV ${rows.length + 1}行: ${errors[0]!.message}`); }
      const row = result.data;
      const record = text.slice(previousCursor, result.meta.cursor);
      previousCursor = result.meta.cursor;
      if (row.length === 1 && row[0] === '' && /^[\r\n]*$/.test(record)) { pendingEmpty++; return; }
      if (rows.length + pendingEmpty >= 501 || row.length > 501) { parser.abort(); throw new Error('CSVの行・列はヘッダー込み501以内にしてください。'); }
      while (pendingEmpty > 0) { rows.push([{ value: '', type: 's' }]); pendingEmpty--; }
      rows.push(row.map(value => ({ value, type: 's' })));
    },
  });
  return { rows, detectedDelimiter, rowOffset: 0, colOffset: 0 };
}

export const ZIP_LIMIT = 100 * 1024 * 1024;
export const ZIP_ENTRIES = 10_000;
/** Stream actual bytes before SheetJS. Do not trust declared uncompressed ZIP sizes. */
export function boundedUnzip(bytes: Uint8Array, maxBytes = ZIP_LIMIT, maxEntries = ZIP_ENTRIES): Record<string, Uint8Array> {
  const files: Record<string, Uint8Array> = Object.create(null) as Record<string, Uint8Array>;
  let count = 0, total = 0;
  const unzip = new Unzip(file => {
    if (++count > maxEntries) throw new Error('ZIPエントリ数上限を超えました。');
    if (Object.hasOwn(files, file.name)) throw new Error('重複ZIPエントリは利用できません。');
    if (file.originalSize !== undefined && file.originalSize > maxBytes - total) throw new Error('ZIP展開量上限を超えました。');
    files[file.name] = new Uint8Array();
    const chunks: Uint8Array[] = [];
    let length = 0;
    file.ondata = (err, chunk, final) => {
      if (err) throw err;
      total += chunk.length; length += chunk.length;
      if (total > maxBytes) throw new Error('ZIP実展開量上限を超えました。');
      chunks.push(chunk);
      if (final) {
        const output = new Uint8Array(length);
        let offset = 0;
        for (const part of chunks) { output.set(part, offset); offset += part.length; }
        files[file.name] = output;
      }
    };
    file.start();
  });
  unzip.register(UnzipInflate);
  // A small input chunk bounds transient inflation allocations as well.
  for (let i = 0; i < bytes.length; i += 1024) unzip.push(bytes.subarray(i, i + 1024), i + 1024 >= bytes.length);
  if (!files['[Content_Types].xml'] || !files['xl/workbook.xml']) throw new Error('非対応または破損したXLSXです。暗号化ブックは利用できません。');
  return files;
}

function selectedTable(book: WorkBook, options: ImportOptions): SourceTable {
  const sheetName = options.sheet || book.SheetNames[0];
  const sheet = sheetName ? book.Sheets[sheetName] : undefined;
  if (!sheet || !sheetName) throw new Error('シートが見つかりません。');
  const range = options.range || sheet['!ref'] || 'A1';
  if (!/^[A-Za-z]+[1-9]\d*(?::[A-Za-z]+[1-9]\d*)?$/.test(range)) throw new Error('範囲はA1形式（例 A1:D4）で指定してください。');
  const bounds = utils.decode_range(range.toUpperCase());
  if (bounds.s.r > bounds.e.r || bounds.s.c > bounds.e.c || bounds.e.r > 1048575 || bounds.e.c > 16383 || bounds.e.r - bounds.s.r > 500 || bounds.e.c - bounds.s.c > 500) throw new Error('選択範囲はExcelの有効座標内、各辺501セル以内にしてください。巨大な申告範囲は明示的に絞ってください。');
  const rows: SourceCell[][] = [];
  for (let r = bounds.s.r; r <= bounds.e.r; r++) {
    const row: SourceCell[] = [];
    for (let c = bounds.s.c; c <= bounds.e.c; c++) {
      const cell = sheet[utils.encode_cell({ r, c })];
      row.push(cell ? { type: cell.t, value: cell.t === 'd' && cell.v instanceof Date ? cell.v.toISOString() : cell.t === 'e' ? (cell.w ?? String(cell.v)) : (cell.v ?? null), ...(cell.f !== undefined ? { formula: cell.f } : {}) } : { type: 'z', value: null });
    }
    rows.push(row);
  }
  for (const merge of sheet['!merges'] ?? []) {
    if (merge.s.r <= bounds.e.r && merge.e.r >= bounds.s.r && merge.s.c <= bounds.e.c && merge.e.c >= bounds.s.c) {
      rows[Math.max(merge.s.r, bounds.s.r) - bounds.s.r]![Math.max(merge.s.c, bounds.s.c) - bounds.s.c]!.type = 'merge';
    }
  }
  return { rows, sheet: sheetName, range: utils.encode_range(bounds), rowOffset: bounds.s.r, colOffset: bounds.s.c };
}

export async function importFile(bytes: ArrayBuffer, name: string, options: ImportOptions, revision: number): Promise<ImportPreview> {
  const start = performance.now();
  if (bytes.byteLength > MAX_FILE_BYTES) throw new Error('ファイルは20MiB以内にしてください。');
  let source: SourceTable;
  let sheets: string[] = [];
  let rangeError: string | null = null;
  if (/\.xlsx$/i.test(name)) {
    const files = boundedUnzip(new Uint8Array(bytes));
    // Store-only ZIP prevents a second uncontrolled inflation inside SheetJS.
    const book = read(zipSync(files, { level: 0 }), { type: 'array', cellDates: true, cellFormula: true, cellStyles: true });
    sheets = book.SheetNames;
    try { source = selectedTable(book, options); }
    catch (error) {
      rangeError = error instanceof Error ? error.message : String(error);
      source = { rows: [], rowOffset: 0, colOffset: 0, sheet: options.sheet || sheets[0] || '' };
    }
  } else if (/\.(csv|tsv)$/i.test(name)) source = parseCsv(bytes, options);
  else throw new Error('対応形式はCSV/TSVと.xlsxです。.xls・.xlsm・暗号化ブックは非対応です。');
  const preview = await validateTable(source, options, name, await sha256Bytes(bytes), revision);
  preview.sheets = sheets;
  if (rangeError) { preview.issues = [{ cell: '範囲', original: options.range, reason: rangeError, fix: 'シートとA1形式の範囲を指定してください。' }]; preview.issueCount = 1; }
  if (sheets.length) preview.warnings.unshift('選択範囲内の非表示シート・行・列も含みます。数式は再計算しません。');
  preview.elapsedMs = performance.now() - start;
  return preview;
}
