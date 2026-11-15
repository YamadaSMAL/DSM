import { describe, expect, it } from 'vitest';
import { utils, write, read, type WorkBook } from 'xlsx';
import { zipSync, strToU8 } from 'fflate';
import { boundedUnzip, importFile, parseCsv } from '../../src/io/import';
import { defaultOptions, type ImportOptions } from '../../src/io/types';
import { isCurrent } from '../../src/workers/protocol';
const csv = (text: string, changes: Partial<ImportOptions> = {}) => importFile(new TextEncoder().encode(text).buffer, 'test.csv', { ...defaultOptions, ...changes }, 1);
function workbook(rows: unknown[][]): WorkBook {
  const book = utils.book_new(); utils.book_append_sheet(book, utils.aoa_to_sheet(rows), '日本語'); return book;
}
function bytes(book: WorkBook): ArrayBuffer { const data = write(book, { type: 'array', bookType: 'xlsx', compression: true }) as ArrayBuffer; return data; }
const xlsx = (book: WorkBook, changes: Partial<ImportOptions> = {}) => importFile(bytes(book), 'test.xlsx', { ...defaultOptions, ...changes }, 1);
describe('CSV取込と検証', () => {
  it('BOM・日本語・CRLF・001・科学表記を保持し、IDと方向を固定する', async () => {
    const result = await csv('\ufeff,001,日本語\r\n001,0,0\r\n日本語,1e2,-0\r\n\r\n');
    expect(result.issueCount).toBe(0); expect(result.matrix!.elements.map(e => [e.id, e.label])).toEqual([['e000001', '001'], ['e000002', '日本語']]);
    expect(Array.from(result.matrix!.values)).toEqual([0, 0, 100, 0]); expect(result.inputHash).toMatch(/^[a-f0-9]{64}$/);
  });
  it('引用符内カンマ・改行を保持する', async () => {
    const result = await csv(',"甲,乙","丙\n丁"\n"甲,乙",0,0\n"丙\n丁",1,0');
    expect(result.issueCount).toBe(0); expect(result.matrix!.elements[1]!.label).toBe('丙\n丁');
  });
  it.each(['\t', ';'] as const)('区切り%sを推定する', async sep => { expect((await csv(`0${sep}0\n1${sep}0`, { labels: false })).issueCount).toBe(0); });
  it('Shift_JISは明示指定でのみ復号する', async () => {
    const data = new Uint8Array([0x2c,0x82,0xa0,0x0a,0x82,0xa0,0x2c,0x30]).buffer;
    await expect(importFile(data, 'sjis.csv', defaultOptions, 1)).rejects.toThrow();
    expect((await importFile(data, 'sjis.csv', { ...defaultOptions, encoding: 'shift_jis' }, 1)).matrix!.elements[0]!.label).toBe('あ');
  });
  it('壊れた引用符を拒否する', async () => { await expect(csv('"A,0\n')).rejects.toThrow('CSV'); });
  it.each(['-1', 'NaN', 'Infinity', '2a', '1e309', 'N/A', '-', '"1,000"', '"1,5"'])('不正値%sを座標と元値付きで拒否する', async value => {
    const result = await csv(`0,0\n${value},0`, { labels: false });
    expect(result.matrix).toBeNull(); expect(result.issues[0]!.cell).toBe('A2'); expect(result.issues[0]!.fix).not.toBe('');
  });
  it('途中の空行・不揃いな行を拒否する', async () => {
    expect((await csv('0,0\n\n1,0', { labels: false })).issueCount).toBeGreaterThan(0);
    expect((await csv('0,0\n1', { labels: false })).issueCount).toBeGreaterThan(0);
  });
  it('変換は明示選択、対角特例は非対角へ適用しない', async () => {
    expect((await csv('-,\nX,-', { labels: false })).matrix).toBeNull();
    const result = await csv('-,\nX,-', { labels: false, symbols: true, blanks: true, diagonalBlanks: true });
    expect(Array.from(result.matrix!.values)).toEqual([0,0,1,0]);
    expect(result.matrix!.provenance.transformations.map(t => [t.kind, t.affectedCells])).toEqual([['diagonal-empty-to-zero', 2], ['empty-to-zero', 1], ['symbol-to-one', 1]]);
    expect((await csv('0,-\n0,0', { labels: false, diagonalBlanks: true })).matrix).toBeNull();
  });
  it('列照合案を提示し適用は明示選択、元セル表は変更しない', async () => {
    const text = ',B,A\nA,2,0\nB,0,1';
    const rejected = await csv(text); expect(rejected.matrix).toBeNull(); expect(rejected.columnProposal).toHaveLength(2);
    const result = await csv(text, { reorderColumns: true }); expect(Array.from(result.matrix!.values)).toEqual([0,2,1,0]); expect(result.source.rows[0]![1]!.value).toBe('B');
  });
  it('重複ラベルは位置一致のみ許可し、検索用IDは異なる', async () => {
    const result = await csv(',A,A\nA,0,1\nA,0,0'); expect(result.issueCount).toBe(0); expect(result.warnings.join()).toContain('重複');
    expect((await csv(',A,B\nA,0,1\nA,0,0', { reorderColumns: true })).matrix).toBeNull();
  });
  it('空・長すぎるラベルを拒否、空白除去を記録する', async () => {
    expect((await csv(',\n,0')).matrix).toBeNull(); expect((await csv(`,${'a'.repeat(201)}\n${'a'.repeat(201)},0`)).matrix).toBeNull();
    const result = await csv(', A \n A ,0'); expect(result.matrix!.elements[0]!.label).toBe('A'); expect(result.matrix!.provenance.transformations[0]!.kind).toBe('trim-labels');
  });
  it('方向を転置し、元セル・対角は保持する', async () => {
    const result = await csv('3,0\n2,0', { labels: false, convention: 'row-supplies-column' });
    expect(Array.from(result.matrix!.values)).toEqual([3,2,0,0]); expect(result.source.rows[1]![0]!.value).toBe('2'); expect(result.warnings.join()).toContain('非ゼロ対角');
  });
  it('0要素を拒否、1要素・全0を許可する', async () => {
    expect((await csv('', { labels: false })).matrix).toBeNull(); const result = await csv('0', { labels: false }); expect(result.matrix!.n).toBe(1); expect(result.warnings.join()).toContain('すべて0');
  });
  it('最初の100件と総件数を返す', async () => { const result = await csv(Array.from({ length: 11 }, () => Array(11).fill('no').join(',')).join('\n'), { labels: false }); expect(result.issueCount).toBe(121); expect(result.issues).toHaveLength(100); });
  it('500要素を許可、501要素・20MiB超を拒否', async () => {
    const result = await csv(Array.from({ length: 500 }, () => Array(500).fill('0').join(',')).join('\n'), { labels: false }); expect(result.matrix!.n).toBe(500);
    expect((await csv(Array.from({ length: 501 }, () => Array(501).fill('0').join(',')).join('\n'), { labels: false })).matrix).toBeNull();
    await expect(importFile(new ArrayBuffer(20 * 1024 * 1024 + 1), 'test.csv', defaultOptions, 1)).rejects.toThrow('20MiB');
  });
  it('CSV解析後の変換でソース表は変化しない', async () => {
    const source = parseCsv(new TextEncoder().encode('X').buffer, defaultOptions); expect(source.rows[0]![0]!.value).toBe('X');
  });
});
describe('XLSX取込とZIP制限', () => {
  it('CSVと同じ正規化行列・ID・解析ハッシュになる', async () => {
    const a = await csv(',甲,乙\n甲,0,0\n乙,1,0'); const b = await xlsx(workbook([['','甲','乙'],['甲',0,0],['乙',1,0]]));
    expect(b.matrix!.values).toEqual(a.matrix!.values); expect(b.matrix!.elements).toEqual(a.matrix!.elements); expect(b.inputHash).toBe(a.inputHash); expect(b.matrix!.provenance.sourceSha256).not.toBe(a.matrix!.provenance.sourceSha256);
  });
  it('複数シートとA1範囲を選択できる', async () => {
    const book = workbook([['dummy']]); utils.book_append_sheet(book, utils.aoa_to_sheet([['x'],['x',0,0],['x',1,0]]), '第二');
    const result = await xlsx(book, { sheet: '第二', range: 'B2:C3', labels: false }); expect(result.sheets).toEqual(['日本語','第二']); expect(result.matrix!.values).toEqual(new Float64Array([0,0,1,0])); expect(result.source.rowOffset).toBe(1);
  });
  it('数式を既定拒否、明示選択時だけ有限数値キャッシュを使う', async () => {
    const book = workbook([[0,0],[1,0]]); book.Sheets['日本語']!['A2'] = { t: 'n', v: 2, f: '1+1' };
    const a = await xlsx(book, { labels: false }); expect(a.matrix).toBeNull(); expect(a.issues[0]!.cell).toBe('A2');
    const b = await xlsx(book, { labels: false, cachedFormula: true }); expect(b.matrix!.values[2]).toBe(2); expect(b.warnings.join()).toContain('A2'); expect(b.source.rows[1]![0]!.formula).toBe('1+1');
    delete book.Sheets['日本語']!['A2']!.v;
    expect((await xlsx(book, { labels: false, cachedFormula: true })).matrix).toBeNull();
  });
  it.each(['boolean', 'date', 'error', 'merge'])('%sセルを拒否する', async type => {
    const book = workbook([[0]]); const sheet = book.Sheets['日本語']!;
    if (type === 'boolean') sheet['A1'] = { t: 'b', v: true };
    if (type === 'date') sheet['A1'] = { t: 'd', v: new Date('2026-01-01') };
    if (type === 'error') sheet['A1'] = { t: 'e', v: 15 };
    if (type === 'merge') sheet['!merges'] = [{ s: { r: 0, c: 0 }, e: { r: 1, c: 1 } }];
    expect((await xlsx(book, { labels: false, range: 'A1' })).matrix).toBeNull();
  });
  it('巨大な申告範囲は拒否し、有効な選択範囲なら許可する', async () => {
    const book = workbook([[0]]); book.Sheets['日本語']!['!ref'] = 'A1:XFD1048576';
    // Write a tiny workbook then patch its XML to avoid generating a giant fixture.
    const files = boundedUnzip(new Uint8Array(bytes(workbook([[0]]))));
    files['xl/worksheets/sheet1.xml'] = strToU8(new TextDecoder().decode(files['xl/worksheets/sheet1.xml']).replace('ref="A1"', 'ref="A1:XFD1048576"'));
    const data = zipSync(files).buffer as ArrayBuffer;
    const a = await importFile(data, 'test.xlsx', { ...defaultOptions, labels: false }, 1); expect(a.matrix).toBeNull(); expect(a.sheets).toEqual(['日本語']);
    expect((await importFile(data, 'test.xlsx', { ...defaultOptions, labels: false, range: 'A1' }, 1)).matrix!.n).toBe(1);
  });
  it('破損・非対応形式・不正範囲を拒否する', async () => {
    await expect(importFile(new Uint8Array([1,2,3]).buffer, 'bad.xlsx', defaultOptions, 1)).rejects.toThrow();
    await expect(importFile(new ArrayBuffer(0), 'bad.xlsm', defaultOptions, 1)).rejects.toThrow('非対応');
    expect((await xlsx(workbook([[0]]), { range: 'A0:B3' })).matrix).toBeNull();
  });
  it('ZIP実展開量とエントリ数を制限し、偽装メタデータでも止まる', () => {
    const compressed = zipSync({ 'bomb': new Uint8Array(100_000), '[Content_Types].xml': strToU8('x'), 'xl/workbook.xml': strToU8('x') });
    expect(() => boundedUnzip(compressed, 1000)).toThrow('上限');
    // Local header uncompressed size is deliberately underreported.
    const forged = compressed.slice(); new DataView(forged.buffer).setUint32(22, 1, true);
    expect(() => boundedUnzip(forged, 1000)).toThrow('上限');
    expect(() => boundedUnzip(compressed, 1_000_000, 1)).toThrow('エントリ');
  });
  it('M3用の列幅・ヘッダー・数値型・式扱いしないラベルを往復できる', () => {
    const book = workbook([['=HYPERLINK("x")','値'],['001',2.25]]); book.Sheets['日本語']!['!cols'] = [{ wch: 24 }, { wch: 12 }];
    const restored = read(bytes(book), { type: 'array', cellStyles: true }); const sheet = restored.Sheets['日本語']!;
    expect(sheet['A1']!.t).toBe('s'); expect(sheet['A1']!.f).toBeUndefined(); expect(sheet['B2']!.v).toBe(2.25); expect(sheet['!cols']![0]!.wch).toBeGreaterThan(20);
  });
});
it('古いrunId・revisionの応答を拒否する', () => { expect(isCurrent({ runId: 'old', dataRevision: 2 }, 'new', 2)).toBe(false); expect(isCurrent({ runId: 'new', dataRevision: 1 }, 'new', 2)).toBe(false); expect(isCurrent({ runId: 'new', dataRevision: 2 }, 'new', 2)).toBe(true); });
it('区切りを持つ全空セル行は空行と区別し、明示変換で保持する', async () => {
  const first = await csv(',\n1,0', { labels: false, blanks: true });
  const last = await csv('0,1\n,', { labels: false, blanks: true });
  expect(Array.from(first.matrix!.values)).toEqual([0,0,1,0]);
  expect(Array.from(last.matrix!.values)).toEqual([0,1,0,0]);
  expect((await csv('0,1\n,', { labels: false })).issueCount).toBe(2);
});
it('引用符付き単一空セルは空ファイルと区別し、明示変換できる', async () => {
  expect((await csv('""', { labels: false, blanks: true })).matrix!.values[0]).toBe(0);
  expect((await csv('', { labels: false, blanks: true })).matrix).toBeNull();
});
