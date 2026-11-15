import { analysisInputHash, createMatrixData, type Transformation } from '../domain';
import type { ImportOptions, ImportPreview, Issue, SourceTable } from './types';

export function coordinate(row: number, col: number): string {
  let name = '';
  for (let c = col + 1; c > 0; c = Math.floor((c - 1) / 26)) name = String.fromCharCode(65 + (c - 1) % 26) + name;
  return `${name}${row + 1}`;
}
const numeric = /^[+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:e[+-]?\d+)?$/i;
export async function validateTable(source: SourceTable, options: ImportOptions, sourceName: string, sourceSha256: string, revision: number): Promise<ImportPreview> {
  const issues: Issue[] = [];
  let issueCount = 0;
  const warnings: string[] = [];
  const transformations: Transformation[] = [];
  const add = (r: number, c: number, reason: string, fix: string) => {
    issueCount++;
    if (issues.length < 100) issues.push({ cell: coordinate(source.rowOffset + r, source.colOffset + c), original: String(source.rows[r]?.[c]?.value ?? ''), reason, fix });
  };
  const rows = source.rows;
  const offset = options.labels ? 1 : 0;
  const n = rows.length - offset;
  if (n < 1 || n > 500 || rows.some(row => row.length !== n + offset)) add(0, 0, '1〜500要素の正方行列が必要です。途中の空行・不揃いな行も確認してください。', '範囲・ヘッダー設定を確認してください。');
  const columnProposal: string[] = [];
  const result = (matrix: ImportPreview['matrix'], inputHash: string | null): ImportPreview => ({ sourceName, source, sheets: [], issues, issueCount, warnings, columnProposal, matrix, inputHash, elapsedMs: 0 });
  if (issueCount) return result(null, null);
  const labels = options.labels ? rows.slice(1).map(row => String(row[0]?.value ?? '').trim()) : Array.from({ length: n }, (_, i) => `要素${i + 1}`);
  let columns = Array.from({ length: n }, (_, i) => i);
  if (options.labels) {
    const columnLabels = rows[0]!.slice(1).map(cell => String(cell.value ?? '').trim());
    for (let i = 0; i < n; i++) {
      if (!labels[i] || labels[i]!.length > 200) add(i + 1, 0, '行ラベルが空または200文字超です。', 'ラベルを修正してください。');
      if (!columnLabels[i] || columnLabels[i]!.length > 200) add(0, i + 1, '列ラベルが空または200文字超です。', 'ラベルを修正してください。');
    }
    const unique = new Set(labels).size === n && new Set(columnLabels).size === n;
    if (!unique) warnings.push('重複ラベルがあります。検索結果はIDで区別し、ラベルの自動照合は行いません。');
    if (labels.some((label, i) => label !== columnLabels[i])) {
      if (unique && labels.every(label => columnLabels.includes(label))) {
        columnProposal.push(...labels.map(label => `${columnLabels.indexOf(label) + 1}列目 → ${label}`));
        if (options.reorderColumns) {
          columns = labels.map(label => columnLabels.indexOf(label));
          transformations.push({ kind: 'align-columns', params: { order: columns }, affectedCells: n * columns.filter((c, i) => c !== i).length });
        } else add(0, 0, '行・列ラベルの順序が異なります。列照合案の確認が必要です。', '提示された列順を確認して「列照合案を適用」を選んでください。');
      } else add(0, 0, '行・列ラベルが一致しません。重複時は位置ごとの一致が必須です。', '行と列を同じラベル順にしてください。');
    }
    const trimmed = rows.reduce((count, row, r) => count + row.filter((cell, c) => (r === 0 || c === 0) && !(r === 0 && c === 0) && String(cell.value ?? '') !== String(cell.value ?? '').trim()).length, 0);
    if (trimmed) transformations.push({ kind: 'trim-labels', params: {}, affectedCells: trimmed });
  }
  const counts: Record<string, number> = {};
  const count = (kind: string) => { counts[kind] = (counts[kind] ?? 0) + 1; };
  const numericRows = Array.from({ length: n }, () => new Array<number>(n).fill(0));
  const cached: string[] = [];
  // Validate types in labels too; formula labels must never silently use cached text.
  rows.forEach((row, r) => row.forEach((cell, c) => {
    if (['b', 'd', 'e', 'merge'].includes(cell.type)) add(r, c, `非対応のセル型: ${cell.type}`, '結合を解除し、日付・真偽値・エラー値を通常の数値またはラベルに置き換えてください。');
    if (cell.formula !== undefined) {
      if (!options.cachedFormula || cell.type !== 'n' || typeof cell.value !== 'number' || !Number.isFinite(cell.value)) add(r, c, `数式セル =${cell.formula} は利用できません。`, '有限の保存済み数値があれば詳細設定でキャッシュ利用を選択できます。');
      else cached.push(coordinate(source.rowOffset + r, source.colOffset + c));
    }
  }));
  for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) {
    const r = i + offset, c = columns[j]! + offset;
    const cell = rows[r]![c]!;
    const raw = cell.value;
    const value = typeof raw === 'string' ? raw.trim() : raw;
    let parsed: number;
    if (i === j && options.diagonalBlanks && (value === '' || value === null || value === '-')) { parsed = 0; count('diagonal-empty-to-zero'); }
    else if (value === '' || value === null) {
      if (!options.blanks) { add(r, c, '空セルです。', '値を入力するか「空セル=0」を選択してください。'); continue; }
      parsed = 0; count('empty-to-zero');
    } else if (typeof value === 'string' && /^[Xx×]$/.test(value) && options.symbols) { parsed = 1; count('symbol-to-one'); }
    else if (typeof value === 'number' || typeof value === 'string' && numeric.test(value)) parsed = Number(value);
    else { add(r, c, '非負有限実数として解釈できません。', '小数点はピリオドを使い、桁区切り・文字を除いてください。'); continue; }
    if (!Number.isFinite(parsed) || parsed < 0) { add(r, c, '負値または非有限数です。', '0以上の有限値へ修正してください。'); continue; }
    if (Object.is(parsed, -0)) count('negative-zero');
    numericRows[i]![j] = parsed === 0 ? 0 : parsed;
  }
  if (cached.length) {
    warnings.push(`保存済み計算値を使用（再計算なし・古い可能性）: ${cached.join(', ')}`);
    transformations.push({ kind: 'formula-cache', params: { cells: cached }, affectedCells: cached.length });
  }
  for (const [kind, affectedCells] of Object.entries(counts)) transformations.push({ kind, params: {}, affectedCells });
  if (issueCount) return result(null, null);
  const matrix = createMatrixData(numericRows, {
    convention: options.convention, labels, revision,
    provenance: { sourceName, sourceSha256, ...(source.sheet ? { sheet: source.sheet } : {}), ...(source.range ? { range: source.range } : {}), importOptions: { ...options, ...(source.detectedDelimiter ? { detectedDelimiter: source.detectedDelimiter } : {}) }, transformations },
  });
  if (matrix.values.every(v => v === 0)) warnings.push('すべて0です。関係情報がありません。');
  if (numericRows.some((row, i) => row[i] !== 0)) warnings.push('非ゼロ対角があります。原値は保持し、解析時に除外します。');
  if (numericRows.some((row, i) => row.some((v, j) => v !== numericRows[j]![i]))) warnings.push('非対称行列です。工程用の方向を保持します。');
  return result(matrix, await analysisInputHash(matrix));
}
